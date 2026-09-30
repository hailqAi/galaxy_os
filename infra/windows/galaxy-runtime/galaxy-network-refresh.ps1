[CmdletBinding()]
param([switch]$CheckOnly)
$ErrorActionPreference = 'Stop'

function Get-GalaxyForwardPlan([string]$WslAddress, [string]$Gateway, [int]$PrefixLength, [hashtable]$Existing, [hashtable]$Owned) {
    $ip = $null; $gatewayIp = $null
    if (-not [Net.IPAddress]::TryParse($WslAddress, [ref]$ip) -or $ip.AddressFamily -ne 'InterNetwork' -or $ip.ToString() -ne $WslAddress) { throw 'Invalid canonical WSL IPv4' }
    if (-not [Net.IPAddress]::TryParse($Gateway, [ref]$gatewayIp) -or $gatewayIp.AddressFamily -ne 'InterNetwork' -or $PrefixLength -lt 8 -or $PrefixLength -gt 30) { throw 'Invalid WSL host network' }
    $bytes = $ip.GetAddressBytes(); $gatewayBytes = $gatewayIp.GetAddressBytes()
    if ($bytes[0] -eq 0 -or $bytes[0] -eq 127 -or $bytes[0] -ge 224 -or $WslAddress -eq $Gateway) { throw 'WSL target is not a guest IPv4' }
    for ($bit = 0; $bit -lt $PrefixLength; $bit++) {
        $index = [int][Math]::Floor($bit / 8); $mask = 1 -shl (7 - ($bit % 8))
        if (($bytes[$index] -band $mask) -ne ($gatewayBytes[$index] -band $mask)) { throw 'WSL target is outside the Windows WSL subnet' }
    }
    foreach ($mapping in @(@(3000,3000), @(80,8080), @(443,8443))) {
        $key = "0.0.0.0/$($mapping[0])"; $desired = "$WslAddress/$($mapping[1])"
        if (-not $Owned.ContainsKey($key)) { throw "Missing reviewed ownership: $key" }
        if ($Existing.ContainsKey($key) -and $Existing[$key] -ne $Owned[$key] -and $Existing[$key] -ne $desired) { throw "Galaxy forwarding was reassigned; refusing to overwrite $key" }
        $operation = if ($Existing[$key] -eq $desired) { 'none' } elseif ($Existing.ContainsKey($key)) { 'set' } else { 'add' }
        [pscustomobject]@{RegistryKey=$key; ListenPort=$mapping[0]; ConnectPort=$mapping[1]; Address=$WslAddress; ConnectString=$desired; Operation=$operation}
    }
}

function Read-GalaxyPortproxy {
    $rules = @{}
    $path = 'HKLM:\SYSTEM\CurrentControlSet\Services\PortProxy\v4tov4\tcp'
    if (Test-Path $path) {
        $key = Get-Item $path
        foreach ($name in $key.GetValueNames()) { $rules[$name] = [string]$key.GetValue($name) }
    }
    return $rules
}

$ownerSid = 'S-1-5-21-1906621822-645860582-1905646032-1001'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -ne $ownerSid) { throw 'Run only as the verified Windows distro owner' }
if (-not $CheckOnly -and -not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Administrator token is required for forwarding changes' }
$statePath = Join-Path $PSScriptRoot 'network-state.json'
$state = Get-Content $statePath -Raw | ConvertFrom-Json
if ($state.ownerSid -ne $ownerSid -or $state.distro -ne 'Ubuntu-22.04') { throw 'Unrecognized network ownership receipt' }
$owned = @{}; $state.rules.PSObject.Properties | ForEach-Object { $owned[$_.Name] = [string]$_.Value }
$wsl = Join-Path $env:WINDIR 'System32\wsl.exe'
$raw = & $wsl -d Ubuntu-22.04 -u hailq_glx --exec /usr/sbin/ip -j -4 addr show dev eth0
if ($LASTEXITCODE -ne 0) { throw 'Could not read the owned WSL eth0 address' }
$addresses = @((($raw -join "`n") | ConvertFrom-Json).addr_info | Where-Object {$_.family -eq 'inet' -and $_.scope -eq 'global'})
if ($addresses.Count -ne 1) { throw 'Expected exactly one WSL eth0 IPv4' }
$hostNetworks = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -like 'vEthernet (WSL*'})
if ($hostNetworks.Count -ne 1) { throw 'Expected exactly one Windows WSL IPv4 network' }
if (-not (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.IPAddress -eq '192.168.1.80'})) { throw 'Reviewed Windows LAN address is absent; inspect before changing forwarding' }
$plan = @(Get-GalaxyForwardPlan $addresses[0].local $hostNetworks[0].IPAddress $hostNetworks[0].PrefixLength (Read-GalaxyPortproxy) $owned)
if ($CheckOnly) { $plan | ConvertTo-Json -Compress; return }
foreach ($item in $plan) {
    if ($item.Operation -ne 'none') {
        & "$env:WINDIR\System32\netsh.exe" interface portproxy $item.Operation v4tov4 "listenaddress=0.0.0.0" "listenport=$($item.ListenPort)" "connectaddress=$($item.Address)" "connectport=$($item.ConnectPort)" | Out-Null
        if ($LASTEXITCODE -ne 0) { throw "netsh failed for Galaxy port $($item.ListenPort)" }
    }
    if ((Read-GalaxyPortproxy)[$item.RegistryKey] -ne $item.ConnectString) { throw "Forwarding readback failed for $($item.ListenPort)" }
    $state.rules.PSObject.Properties[$item.RegistryKey].Value = $item.ConnectString
    $state | ConvertTo-Json -Depth 4 | Set-Content "$statePath.tmp" -Encoding UTF8
    Move-Item "$statePath.tmp" $statePath -Force
}
[pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o'); state='VERIFIED'; address=$addresses[0].local; changed=@($plan | Where-Object Operation -ne 'none').Count} | ConvertTo-Json -Compress

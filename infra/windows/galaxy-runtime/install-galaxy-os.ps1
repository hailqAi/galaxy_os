[CmdletBinding()]
param([switch]$Install, [switch]$EnableLinger, [ValidatePattern('^[A-Za-z0-9_.-]{1,100}$')][string]$ExpectedRelease)
$ErrorActionPreference = 'Stop'
$ownerSid = 'S-1-5-21-1906621822-645860582-1905646032-1001'
$owner = 'DESKTOP-VPF0AQ3\Admin'
$destination = Join-Path $env:ProgramData 'GalaxyOS'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($identity.User.Value -ne $ownerSid) { throw 'Use the same Windows owner for UAC; alternate administrator credentials select the wrong WSL distro' }
$distro = @(Get-ChildItem HKCU:\Software\Microsoft\Windows\CurrentVersion\Lxss | ForEach-Object {Get-ItemProperty $_.PSPath} | Where-Object DistributionName -eq 'Ubuntu-22.04')
if ($distro.Count -ne 1 -or $distro[0].DefaultUid -ne 1000) { throw 'Verified owner/distro binding changed' }
$payload = @('galaxy-network-refresh.ps1','galaxy-wsl-keeper.ps1','galaxy-http-observer.ps1')
$hashes = Get-Content (Join-Path $PSScriptRoot 'reviewed-sha256.json') -Raw | ConvertFrom-Json
foreach ($file in @($payload + 'install-galaxy-os.ps1')) {
    if ((Get-FileHash (Join-Path $PSScriptRoot $file) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hashes.$file) { throw "Reviewed payload changed: $file" }
}
if (-not $Install) {
    [pscustomobject]@{mode='REVIEW_ONLY';owner=$owner;sid=$ownerSid;distro='Ubuntu-22.04';destination=$destination;tasks=@('Galaxy OS WSL Runtime','Galaxy OS Network Refresh','Galaxy OS Runtime Observer');startsTasks=$false;changesFirewall=$false;enableLinger=[bool]$EnableLinger;expectedRelease=$ExpectedRelease} | ConvertTo-Json -Depth 3
    return
}
if (-not $ExpectedRelease) { throw 'Bind this installation to a reviewed candidate release' }
if (-not ([Security.Principal.WindowsPrincipal]$identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Run the reviewed installer once through UAC as the same owner' }
if (Test-Path $destination) {
    if ((Get-Item $destination).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Protected destination must not be a link' }
    $existingOwner = (Get-Acl $destination).GetOwner([Security.Principal.SecurityIdentifier]).Value
    if ($existingOwner -notin @('S-1-5-32-544','S-1-5-18')) { throw 'Existing ProgramData directory is not owned by Administrators/SYSTEM; inspect manually' }
}
function Protect-GalaxyPath([string]$Path) {
    if ((Get-Item $Path).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'A protected file or directory must not be a link' }
    $isDirectory = (Get-Item $Path).PSIsContainer
    $acl = if ($isDirectory) { New-Object Security.AccessControl.DirectorySecurity } else { New-Object Security.AccessControl.FileSecurity }
    $acl.SetOwner((New-Object Security.Principal.SecurityIdentifier('S-1-5-32-544')))
    $acl.SetAccessRuleProtection($true,$false)
    $inheritance = if ($isDirectory) { 'ContainerInherit,ObjectInherit' } else { 'None' }
    foreach ($entry in @(@('S-1-5-18','FullControl'),@('S-1-5-32-544','FullControl'),@('S-1-5-32-545','ReadAndExecute'))) {
        $rule = New-Object Security.AccessControl.FileSystemAccessRule((New-Object Security.Principal.SecurityIdentifier($entry[0])),$entry[1],$inheritance,'None','Allow')
        $acl.AddAccessRule($rule)
    }
    Set-Acl -Path $Path -AclObject $acl
}
$tasks = @(
    @{Name='Galaxy OS Network Refresh';File='galaxy-network-refresh.ps1';Level='Highest';AtLogon=$true;Minutes=3},
    @{Name='Galaxy OS WSL Runtime';File='galaxy-wsl-keeper.ps1';Level='Limited';AtLogon=$true;Minutes=0},
    @{Name='Galaxy OS Runtime Observer';File='galaxy-http-observer.ps1';Level='Limited';AtLogon=$false;Minutes=65}
)
$powershell = Join-Path $env:WINDIR 'System32\WindowsPowerShell\v1.0\powershell.exe'
foreach ($task in $tasks) {
    $existing = Get-ScheduledTask -TaskName $task.Name -ErrorAction SilentlyContinue
    if ($existing) {
        $taskOwner = if ($existing.Principal.UserId -like 'S-1-*') { $existing.Principal.UserId } else { (New-Object Security.Principal.NTAccount($existing.Principal.UserId)).Translate([Security.Principal.SecurityIdentifier]).Value }
        if ($taskOwner -ne $ownerSid -or $existing.Actions.Count -ne 1 -or $existing.Actions[0].Execute -ne $powershell -or $existing.Actions[0].Arguments -notlike ('*"' + (Join-Path $destination $task.File) + '"*')) { throw "Task name is already used by an unrecognized action: $($task.Name)" }
        if ($existing.State -eq 'Running') { throw "Stop/review the owned task before replacing it: $($task.Name)" }
    }
}
# All collision/hash/owner checks precede the first persistent change.
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Protect-GalaxyPath $destination
foreach ($file in $payload) {
    $target = Join-Path $destination $file
    if (Test-Path $target) {
        if ((Get-Item $target).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Existing payload is a link' }
        if ((Test-Path "$target.previous") -and ((Get-Item "$target.previous").Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Previous payload backup must not be a link' }
        Copy-Item $target "$target.previous" -Force
        Protect-GalaxyPath "$target.previous"
        Remove-Item $target
    }
    Copy-Item (Join-Path $PSScriptRoot $file) $target
    Protect-GalaxyPath $target
    if ((Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hashes.$file) { throw "Protected copy verification failed: $file" }
}
$statePath = Join-Path $destination 'network-state.json'
if (-not (Test-Path $statePath)) {
    # These are the three reviewed mappings observed before this repair.
    $rules = @{'0.0.0.0/3000'='172.31.138.252/3000';'0.0.0.0/80'='172.31.138.252/8080';'0.0.0.0/443'='172.31.138.252/8443'}
    [pscustomobject]@{ownerSid=$ownerSid;distro='Ubuntu-22.04';rules=$rules} | ConvertTo-Json -Depth 3 | Set-Content $statePath -Encoding UTF8
}
Protect-GalaxyPath $statePath
foreach ($task in $tasks) {
    $arguments = '-NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "' + (Join-Path $destination $task.File) + '"'
    if ($task.Name -eq 'Galaxy OS Runtime Observer') { $arguments += ' -Samples 120 -IntervalSeconds 10 -ExpectedRelease ' + $ExpectedRelease }
    $action = New-ScheduledTaskAction -Execute $powershell -Argument $arguments
    $principal = New-ScheduledTaskPrincipal -UserId $ownerSid -LogonType Interactive -RunLevel $task.Level
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Minutes $task.Minutes) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
    $definition = @{Action=$action;Principal=$principal;Settings=$settings;Description='Galaxy OS approved local runtime. Same owner/distro; no credentials stored.'}
    if ($task.AtLogon) { $definition.Trigger = New-ScheduledTaskTrigger -AtLogOn -User $owner }
    Register-ScheduledTask -TaskName $task.Name -InputObject (New-ScheduledTask @definition) -Force | Out-Null
}
if ($EnableLinger) {
    & "$env:WINDIR\System32\wsl.exe" -d Ubuntu-22.04 -u root --exec /usr/bin/loginctl enable-linger hailq_glx
    if ($LASTEXITCODE -ne 0) { throw 'Owned-distro linger installation failed; inspect partial receipt/tasks' }
}
$receipt = [pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o');state='INSTALLED_NOT_STARTED';ownerSid=$ownerSid;distro='Ubuntu-22.04';releaseId=$ExpectedRelease;tasks=$tasks.Name;lingerRequested=[bool]$EnableLinger;payloadHashes=$hashes;observerFolder=(Join-Path $env:LOCALAPPDATA 'GalaxyOS\observer')}
$receiptPath = Join-Path $destination 'install-receipt.json'
if (Test-Path $receiptPath) { Protect-GalaxyPath $receiptPath }
$receipt | ConvertTo-Json -Depth 4 | Set-Content $receiptPath -Encoding UTF8
$receipt | ConvertTo-Json -Depth 4

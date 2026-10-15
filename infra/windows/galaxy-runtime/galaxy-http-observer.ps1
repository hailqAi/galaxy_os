[CmdletBinding()]
param([ValidateRange(1,600)][int]$Samples=120, [ValidateRange(2,60)][int]$IntervalSeconds=10, [ValidatePattern('^[A-Za-z0-9_.-]{1,100}$')][string]$ExpectedRelease)
$ErrorActionPreference = 'Stop'
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-21-1906621822-645860582-1905646032-1001') { throw 'Wrong observer owner' }
Add-Type -AssemblyName System.Net.Http
$folder = Join-Path $env:LOCALAPPDATA 'GalaxyOS\observer'
New-Item -ItemType Directory -Path $folder -Force | Out-Null
$output = Join-Path $folder ("observer-" + [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss') + '.jsonl')
$handler = New-Object Net.Http.HttpClientHandler
$handler.UseProxy = $false; $handler.UseCookies = $false; $handler.AllowAutoRedirect = $false
$client = New-Object Net.Http.HttpClient($handler)
$client.Timeout = [TimeSpan]::FromSeconds(5)
try {
    for ($sample=0; $sample -lt $Samples; $sample++) {
        foreach ($origin in @('http://localhost:3000','http://192.168.1.80:3000')) {
            foreach ($path in @('/health','/login')) {
                $row = [ordered]@{utc=[DateTime]::UtcNow.ToString('o'); observerPid=$PID; sample=$sample; url="$origin$path"; status=$null; releaseId=$null; instanceId=$null; requestId=$null; cacheControl=$null; expectedRelease=$ExpectedRelease; releaseMatches=$null; error=$null}
                try {
                    $response = $client.GetAsync("$origin$path").GetAwaiter().GetResult()
                    $row.status = [int]$response.StatusCode
                    $row.cacheControl = [string]$response.Headers.CacheControl
                    foreach ($pair in @(@('releaseId','x-galaxy-release'),@('instanceId','x-galaxy-instance'),@('requestId','x-request-id'))) {
                        if ($response.Headers.Contains($pair[1])) { $row[$pair[0]] = [string]($response.Headers.GetValues($pair[1]) | Select-Object -First 1) }
                    }
                    if ($path -eq '/health') {
                        $health = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult() | ConvertFrom-Json
                        foreach ($key in @('releaseId','instanceId','requestId')) { if ($health.PSObject.Properties.Name -contains $key) { $row[$key] = [string]$health.$key } }
                    }
                    if ($ExpectedRelease) { $row.releaseMatches = $row.releaseId -eq $ExpectedRelease }
                    $response.Dispose()
                } catch { $row.error = $_.Exception.GetType().Name }
                $row | ConvertTo-Json -Compress | Add-Content $output -Encoding UTF8
            }
        }
        if ($sample -lt $Samples-1) { Start-Sleep -Seconds $IntervalSeconds }
    }
} finally { $client.Dispose(); $handler.Dispose() }
[pscustomobject]@{file=$output;samples=$Samples;state='FINISHED'} | ConvertTo-Json -Compress

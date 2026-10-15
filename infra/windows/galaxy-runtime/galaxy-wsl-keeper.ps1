$ErrorActionPreference = 'Stop'
if ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ne 'S-1-5-21-1906621822-645860582-1905646032-1001') { throw 'Wrong Windows distro owner' }
$logFolder = Join-Path $env:LOCALAPPDATA 'GalaxyOS'
New-Item -ItemType Directory -Path $logFolder -Force | Out-Null
$keeper = Start-Process -FilePath "$env:WINDIR\System32\wsl.exe" -ArgumentList @('-d','Ubuntu-22.04','-u','hailq_glx','--exec','/usr/bin/sleep','infinity') -WindowStyle Hidden -PassThru
try {
    try { Start-ScheduledTask -TaskName 'Galaxy OS Network Refresh' }
    catch {
        [pscustomobject]@{utc=[DateTime]::UtcNow.ToString('o');event='network_refresh_launch_failed';error=$_.Exception.GetType().Name} | ConvertTo-Json -Compress | Add-Content (Join-Path $logFolder 'keeper.jsonl') -Encoding UTF8
    }
    $keeper.WaitForExit()
    # Task Scheduler retries unexpected WSL exits at most three times.
    exit 1
} finally {
    if (-not $keeper.HasExited) { $keeper.Kill() }
}

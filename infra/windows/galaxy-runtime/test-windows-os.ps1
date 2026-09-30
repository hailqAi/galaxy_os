$ErrorActionPreference = 'Stop'
function Assert($Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
$scriptPath = Join-Path $PSScriptRoot 'galaxy-network-refresh.ps1'
Assert (Test-Path $scriptPath) 'RED: scoped network planner is missing'
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile($scriptPath, [ref]$tokens, [ref]$errors)
Assert ($errors.Count -eq 0) 'Network helper has syntax errors'
foreach ($definition in $ast.FindAll({param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst]}, $false)) {
    . ([scriptblock]::Create($definition.Extent.Text))
}
$owned = @{'0.0.0.0/3000'='172.31.138.252/3000';'0.0.0.0/80'='172.31.138.252/8080';'0.0.0.0/443'='172.31.138.252/8443'}
$existing = $owned.Clone(); $existing['127.0.0.1/9999']='192.168.132.2/9999'
$plan = @(Get-GalaxyForwardPlan '172.31.138.252' '172.31.128.1' 20 $existing $owned)
Assert ($plan.Count -eq 3 -and @($plan | Where-Object Operation -ne 'none').Count -eq 0) 'Matching Galaxy rules must remain unchanged'
$plan = @(Get-GalaxyForwardPlan '172.31.130.2' '172.31.128.1' 20 $existing $owned)
Assert (@($plan | Where-Object Operation -eq 'set').Count -eq 3) 'A changed WSL address must update only three Galaxy rules'
Assert ($existing['127.0.0.1/9999'] -eq '192.168.132.2/9999') 'Unrelated forwarding was changed'
foreach ($bad in @('127.0.0.1','0.0.0.0','172.31.128.1','192.168.1.80','172.31.130.2; calc','::1')) {
    $rejected = $false
    try { Get-GalaxyForwardPlan $bad '172.31.128.1' 20 $existing $owned | Out-Null } catch { $rejected = $true }
    Assert $rejected "Unsafe or unrelated target accepted: $bad"
}
$foreign = $existing.Clone(); $foreign['0.0.0.0/3000']='192.168.1.42/9000'
$rejected = $false
try { Get-GalaxyForwardPlan '172.31.130.2' '172.31.128.1' 20 $foreign $owned | Out-Null } catch { $rejected = $true }
Assert $rejected 'A port reassigned to another service must not be overwritten'
foreach ($file in Get-ChildItem $PSScriptRoot -Filter '*.ps1') {
    $tokens = $null; $errors = $null
    [void][Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$errors)
    Assert ($errors.Count -eq 0) "Syntax errors: $($file.Name): $errors"
}
'PASS: exact forwarding, address validation, ownership collision, unrelated-rule preservation, PowerShell syntax'

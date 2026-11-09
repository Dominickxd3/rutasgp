param(
    [string]$ProjectRoot = (Join-Path $PSScriptRoot '..\..'),
    [string]$TaskName = 'RutasGP',
    [switch]$OpenFirewall,
    [ValidateRange(1,65535)][int]$Port = 3000
)
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecute este instalador en PowerShell como administrador.'
}
$resolvedRoot = (Resolve-Path -LiteralPath $ProjectRoot).Path
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
if (-not (Get-OdbcDriver -Name 'ODBC Driver 17 for SQL Server' -Platform '64-bit' -ErrorAction SilentlyContinue)) {
    throw 'Instale Microsoft ODBC Driver 17 for SQL Server de 64 bits.'
}
foreach ($relativePath in @('api\.env.production','api\dist\main.js','web\dist\index.html')) {
    if (-not (Test-Path -LiteralPath (Join-Path $resolvedRoot $relativePath))) {
        throw "Falta $relativePath. Configure y compile la aplicacion primero."
    }
}
$launcher = Join-Path $resolvedRoot 'deployment\windows\start.cmd'
$arguments = '/d /s /c ""{0}" "{1}""' -f $launcher,$nodePath
$action = New-ScheduledTaskAction -Execute "$env:SystemRoot\System32\cmd.exe" `
    -Argument $arguments -WorkingDirectory $resolvedRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew `
    -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero)
$account = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing -and $existing.State -eq 'Running') {
    throw "La tarea $TaskName esta en ejecucion. Detengala antes de actualizar la instalacion."
}
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $account -Description 'Aplicacion Rutas GP. Web, API e historicos GPS.' -Force | Out-Null
if ($OpenFirewall) {
    $ruleName = 'RutasGP-Application'
    if (-not (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name $ruleName -DisplayName 'Rutas GP' -Direction Inbound `
            -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain,Private `
            -RemoteAddress LocalSubnet | Out-Null
    }
}
Start-ScheduledTask -TaskName $TaskName
Write-Output "Tarea $TaskName instalada e iniciada. Revise /api/health y logs\application.log."

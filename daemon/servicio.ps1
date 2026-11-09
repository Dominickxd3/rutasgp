param(
    [ValidateSet('Preparar','Instalar','Iniciar','Detener','Reiniciar','Estado','Desinstalar')]
    [string]$Accion = 'Estado'
)
$ErrorActionPreference = 'Stop'
$serviceName = 'DistribucionRutas'
$root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$wrapper = Join-Path $PSScriptRoot 'distribucionrutas.exe'
$config = Join-Path $PSScriptRoot 'distribucionrutas.xml'
$expectedHash = '05B82D46AD331CC16BDC00DE5C6332C1EF818DF8CEEFCD49C726553209B3A0DA'
$downloadUrl = 'https://github.com/winsw/winsw/releases/download/v2.12.0/WinSW-x64.exe'

function Invoke-Wrapper([string]$Command) {
    & $wrapper $Command
    if ($LASTEXITCODE -ne 0) { throw "WinSW fallo al ejecutar $Command. Codigo $LASTEXITCODE." }
}

if ($Accion -eq 'Estado') {
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    if ($service) { $service | Select-Object Name,Status,StartType }
    else { Write-Output 'El servicio DistribucionRutas aun no esta instalado.' }
    exit 0
}

if ($Accion -ne 'Preparar') {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Abra PowerShell como administrador para administrar el servicio.'
    }
}

if ($Accion -in @('Preparar','Instalar')) {
    if (Get-Service -Name $serviceName -ErrorAction SilentlyContinue) {
        throw 'El servicio ya existe. Use Iniciar, Detener o Reiniciar. Para reinstalar, use Desinstalar primero.'
    }
    $nodePath = (Get-Command node.exe -ErrorAction Stop).Source
    $architecture = & $nodePath -p 'process.arch'
    if ($LASTEXITCODE -ne 0 -or $architecture -ne 'x64') { throw 'Se requiere Node.js de 64 bits.' }
    if (-not (Test-Path -LiteralPath $wrapper)) {
        $temporary = Join-Path $PSScriptRoot ([guid]::NewGuid().ToString() + '.download')
        try {
            [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
            Invoke-WebRequest -UseBasicParsing -Uri $downloadUrl -OutFile $temporary
            if ((Get-FileHash -LiteralPath $temporary -Algorithm SHA256).Hash -ne $expectedHash) {
                throw 'El ejecutable descargado no coincide con la huella SHA256 esperada.'
            }
            Move-Item -LiteralPath $temporary -Destination $wrapper
        }
        finally {
            if (Test-Path -LiteralPath $temporary) { Remove-Item -LiteralPath $temporary }
        }
    }
    if ((Get-FileHash -LiteralPath $wrapper -Algorithm SHA256).Hash -ne $expectedHash) {
        throw 'El ejecutable del servicio no coincide con WinSW 2.12.0 x64.'
    }
    $template = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'distribucionrutas.template.xml'))
    $xml = $template.Replace('__NODE_PATH__', [Security.SecurityElement]::Escape($nodePath))
    [xml]$validated = $xml
    [IO.File]::WriteAllText($config, $validated.OuterXml, (New-Object Text.UTF8Encoding($false)))
    New-Item -ItemType Directory -Path (Join-Path $PSScriptRoot 'logs') -Force | Out-Null
    if ($Accion -eq 'Preparar') {
        Write-Output 'Daemon preparado. No se registro ni inicio un servicio.'
        exit 0
    }
    foreach ($file in @('api\dist\main.js','web\dist\index.html','scripts\start-production.mjs')) {
        if (-not (Test-Path -LiteralPath (Join-Path $root $file))) { throw "Falta $file. Compile primero." }
    }
    if (-not (Get-OdbcDriver -Name 'ODBC Driver 17 for SQL Server' -Platform '64-bit' -ErrorAction SilentlyContinue)) {
        throw 'Falta ODBC Driver 17 for SQL Server de 64 bits.'
    }
    Push-Location $root
    try {
        & $nodePath --input-type=module -e "import {loadProductionEnvironment} from './scripts/production-env.mjs'; loadProductionEnvironment();"
        if ($LASTEXITCODE -ne 0) { throw 'Revise API_KEY y el archivo de entorno.' }
    }
    finally { Pop-Location }
    $listener = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Any, 3002)
    try { $listener.Start() }
    catch { throw 'El puerto 3002 no esta disponible. Detenga la ejecucion manual o el sitio IIS que utiliza ese puerto.' }
    finally { $listener.Stop() }
    Invoke-Wrapper 'install'
    Invoke-Wrapper 'start'
}
else {
    if (-not (Test-Path -LiteralPath $wrapper) -or -not (Test-Path -LiteralPath $config)) {
        throw 'Faltan los archivos del daemon. Ejecute Preparar en esta instalacion.'
    }
    switch ($Accion) {
        'Iniciar' { Invoke-Wrapper 'start' }
        'Detener' { Invoke-Wrapper 'stop' }
        'Reiniciar' { Invoke-Wrapper 'restart' }
        'Desinstalar' {
            $service = Get-Service -Name $serviceName -ErrorAction Stop
            if ($service.Status -ne 'Stopped') { Invoke-Wrapper 'stop' }
            Invoke-Wrapper 'uninstall'
        }
    }
}
Get-Service -Name $serviceName -ErrorAction SilentlyContinue | Select-Object Name,Status,StartType

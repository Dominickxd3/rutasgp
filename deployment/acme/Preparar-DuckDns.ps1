$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Ejecute PowerShell como administrador.'
}
$destination = Join-Path $env:ProgramData 'DistribucionRutasAcme'
New-Item -ItemType Directory -Path $destination -Force | Out-Null
& icacls.exe $destination /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'No se pudieron restringir los permisos de la carpeta ACME.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'DuckDns.ps1') -Destination $destination -Force

$secret = Read-Host 'Pegue el token de su cuenta DuckDNS (entrada oculta)' -AsSecureString
if ($secret.Length -eq 0) { throw 'El token no puede estar vacio.' }
Add-Type -AssemblyName System.Security
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
$bytes = $null
try {
    $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim()
    $bytes = [Text.Encoding]::UTF8.GetBytes($token)
    $encrypted = [Security.Cryptography.ProtectedData]::Protect(
        $bytes, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    [IO.File]::WriteAllBytes((Join-Path $destination 'duckdns-token.bin'), $encrypted)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    if ($bytes) { [Array]::Clear($bytes, 0, $bytes.Length) }
    $token = $null
    $secret.Dispose()
}
Write-Output "Configuracion preparada en $destination. El token esta cifrado para este equipo."

param(
    [Parameter(Mandatory=$true,Position=0)][ValidateSet('create','delete')][string]$Action,
    [Parameter(Mandatory=$true,Position=1)][string]$Identifier,
    [Parameter(Mandatory=$true,Position=2)][string]$RecordName,
    [Parameter(Mandatory=$true,Position=3)][string]$TxtValue
)
$ErrorActionPreference = 'Stop'
try {
    $domain = 'distribucionrutas.duckdns.org'
    if ($Identifier.TrimEnd('.') -ine $domain -or
        $RecordName.TrimEnd('.') -ine "_acme-challenge.$domain") {
        throw 'Dominio no autorizado para este script.'
    }
    Add-Type -AssemblyName System.Security
    $tokenPath = Join-Path $env:ProgramData 'DistribucionRutasAcme\duckdns-token.bin'
    $encrypted = [IO.File]::ReadAllBytes($tokenPath)
    $plain = [Security.Cryptography.ProtectedData]::Unprotect(
        $encrypted, $null, [Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    try { $token = [Text.Encoding]::UTF8.GetString($plain).Trim() }
    finally { [Array]::Clear($plain, 0, $plain.Length) }
    if ([string]::IsNullOrWhiteSpace($token)) { throw 'Token ausente.' }
    $encodedToken = [Uri]::EscapeDataString($token)
    $encodedTxt = [Uri]::EscapeDataString($TxtValue)
    $uri = "https://www.duckdns.org/update?domains=distribucionrutas&token=$encodedToken&txt=$encodedTxt"
    if ($Action -eq 'delete') { $uri += '&clear=true' }
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $result = Invoke-RestMethod -Uri $uri -TimeoutSec 60
    if (([string]$result).Trim() -ne 'OK') { throw 'DuckDNS rechazo la operacion.' }
    Write-Output "DuckDNS $Action OK para $domain."
    exit 0
}
catch {
    # Los errores HTTP pueden incluir el token en la URL. Emitir solo un mensaje fijo.
    [Console]::Error.WriteLine('Fallo la validacion DuckDNS. Revise dominio, token local, permisos y salida HTTPS hacia DuckDNS.')
    exit 1
}

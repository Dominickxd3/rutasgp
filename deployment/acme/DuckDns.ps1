param(
    [Parameter(Mandatory=$true,Position=0)][ValidateSet('create','delete')][string]$Action,
    [Parameter(Mandatory=$true,Position=1)][string]$Identifier,
    [Parameter(Mandatory=$true,Position=2)][string]$RecordName,
    [Parameter(Mandatory=$true,Position=3)][string]$TxtValue
)
$ErrorActionPreference = 'Stop'
$stage = 'comprobar dominio'
try {
    $domain = 'distribucionrutas.duckdns.org'
    if ($Identifier.TrimEnd('.') -ine $domain -or
        $RecordName.TrimEnd('.') -ine "_acme-challenge.$domain") {
        throw 'Dominio no autorizado para este script.'
    }
    $stage = 'leer y descifrar token local'
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
    $stage = 'conectar por HTTPS con DuckDNS'
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $result = Invoke-RestMethod -Uri $uri -TimeoutSec 60
    $stage = 'comprobar respuesta de DuckDNS'
    if (([string]$result).Trim() -ne 'OK') {
        [Console]::Error.WriteLine('DuckDNS no respondio OK. Compruebe que el token corresponda a la cuenta propietaria de distribucionrutas.')
        exit 1
    }
    Write-Output "DuckDNS $Action OK para $domain."
    exit 0
}
catch {
    # Los mensajes HTTP pueden incluir el token. Mostrar solo etapa y tipos de error.
    $exception = $_.Exception.GetBaseException()
    $type = $exception.GetType().Name
    $status = 'no disponible'
    if ($exception -is [Net.WebException]) { $status = [string]$exception.Status }
    [Console]::Error.WriteLine("Fallo DuckDNS al $stage. Tipo $type. Estado $status.")
    exit 1
}

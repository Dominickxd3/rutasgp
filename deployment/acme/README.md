# Certificado de distribucionrutas.duckdns.org

La configuracion usa win-acme 2.2.9 y validacion DNS-01 mediante script.
DuckDns.ps1 solo acepta distribucionrutas.duckdns.org y su registro de desafio.
La creacion y limpieza actualizan el TXT por HTTPS mediante la API de DuckDNS.
La validacion de propagacion DNS corresponde a win-acme.

## Preparacion en el servidor

Ejecute Preparar-DuckDns.ps1 como administrador. Solicita el token con entrada
oculta. Lo cifra con DPAPI LocalMachine en ProgramData\DistribucionRutasAcme.
La carpeta concede acceso a SYSTEM y Administradores. La renovacion debe usar
una de esas cuentas en el mismo servidor. El archivo cifrado depende del equipo.
El script se copia fuera de las carpetas publicadas por IIS y del repositorio.

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\deployment\acme\Preparar-DuckDns.ps1
```

Si la entrada oculta solo recibe un caracter, agregue -DesdePortapapeles.
El script esperara a que copie el token desde DuckDNS y pulse Enter. Lo leera
directamente del portapapeles del servidor. Se valida que sea un UUID de 36
caracteres antes de reemplazar el archivo cifrado existente.

win-acme recibe los argumentos create/delete, Identifier, RecordName y Token.
El Token de esos argumentos es el contenido TXT del desafio ACME. El token de
cuenta DuckDNS se lee del archivo local cifrado.

## Emision e instalacion

El sitio distribucion_rutas debe tener el proxy ARR funcionando. Obtenga su ID
con Get-Website. Desde la carpeta permanente de wacs.exe ejecute lo siguiente,
usando el ID real en installationsiteid.

```powershell
.\wacs.exe --source manual --host distribucionrutas.duckdns.org --validationmode dns-01 --validation script --dnsscript C:\ProgramData\DistribucionRutasAcme\DuckDns.ps1 --dnsscriptparallelism 0 --store certificatestore --installation iis --installationsiteid 8 --sslport 443
```

Revise los terminos y las preguntas que muestre win-acme. Configure y compruebe
su tarea de renovacion. La tarea debe apuntar a una carpeta permanente de win-acme
y disponer de salida HTTPS hacia DuckDNS y la autoridad certificadora.

Solo se solicita un dominio por orden. DuckDNS comparte el TXT entre los
subdominios de cada nombre. Evite renovaciones simultaneas del mismo dominio
desde otros clientes. La validacion serial evita conflictos dentro de esta orden.

## Verificacion

Revise el enlace HTTPS del sitio con Get-WebBinding. Compruebe el certificado
y el proxy local usando curl.exe --resolve con el dominio, puerto 443 y la IP
interna del servidor. Despues pruebe desde una red externa.

FortiGate debe reenviar TCP 443 a 10.10.1.11:443 con la politica correspondiente.
IIS selecciona el dominio mediante SNI. El servicio Node conserva el puerto 3002.
La emision mediante DNS puede funcionar aunque el acceso publico siga pendiente.

## Validaciones realizadas

Se verifica la sintaxis PowerShell y se prueban creacion y limpieza con una API
simulada y un token ficticio cifrado. Se prueba rechazo de otro dominio y errores
de API sin revelar el token. La emision real, propagacion, enlace HTTPS y renovacion
quedan pendientes de ejecutar en el servidor con su token y win-acme.

Referencias oficiales en https://www.win-acme.com/reference/plugins/validation/dns/script,
https://www.win-acme.com/reference/plugins/installation/iis y https://www.duckdns.org/spec.jsp.

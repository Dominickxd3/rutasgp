# Despliegue de Rutas GP en Windows Server

La aplicacion publica React y NestJS en el mismo puerto. Las rutas web usan /api
en el mismo servidor. El arranque de produccion requiere API_KEY y los archivos
compilados. La aplicacion utiliza la base SQL existente mediante ODBC Driver 17.

## Requisitos

- Windows Server compatible con Node.js 22 de 64 bits.
- Node.js 22 LTS y npm, instalados para todos los usuarios.
- Git.
- Microsoft ODBC Driver 17 for SQL Server de 64 bits.
- Acceso TCP al SQL Server configurado, actualmente 10.10.1.6:1433.
- Salida a los servicios GPS, mapas y OSRM configurados.
- Tablas y procedimientos de la aplicacion existentes en DB_GP_DistribucionML.
  Los scripts SQL requieren revision y ejecucion administrativa independiente.

## Instalacion

Ejecute PowerShell en el servidor.

```powershell
git clone https://github.com/Dominickxd3/rutasgp.git C:\apps\rutasgp
Set-Location C:\apps\rutasgp
npm ci
Copy-Item api/.env.production.example api/.env.production
```

Edite api/.env.production. Configure API_KEY, GPS_DB_USER y GPS_DB_PASSWORD con
los valores de esta instalacion. Defina CORS_ORIGIN con la URL de acceso si usa
consumidores desde otro origen. PORT es 3000 inicialmente.

Puede generar una clave con este comando y copiar el resultado a API_KEY.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

La arquitectura actual utiliza una clave compartida que tambien se incluye en
el JavaScript del navegador. Esa clave permite acceso a la API y no representa
una cuenta individual. Este procedimiento esta orientado a una instalacion en
red interna con acceso controlado. El perfil y las geocercas locales se almacenan
en el navegador de cada usuario. La asociacion automatica completa de pedidos,
boletas y camiones continua con las limitaciones documentales de la version actual.

Compile con el mismo entorno que utilizara el servidor.

```powershell
npm run typecheck
npm test
npm run build:production
npm run verify:production
```

build:production pasa API_KEY al frontend durante la compilacion y fija /api como
URL relativa. Al cambiar API_KEY vuelva a compilar. Los archivos .env y dist no se
publican en Git. La comprobacion inicia temporalmente el servidor en 127.0.0.1:3197,
con captura GPS desactivada, consulta el catalogo local de vehiculos y termina.

Para iniciar en primer plano utilice npm start. La URL de acceso sera
http://IP_DEL_SERVIDOR:3000 y el estado se consulta en /api/health.

## Arranque permanente

Abra PowerShell como administrador en C:\apps\rutasgp.

```powershell
.\deployment\windows\Install-RutasGP.ps1 -OpenFirewall
Get-ScheduledTask -TaskName RutasGP
Get-ScheduledTaskInfo -TaskName RutasGP
Invoke-RestMethod http://localhost:3000/api/health
Get-Content .\logs\application.log -Tail 50
```

El instalador registra una tarea RutasGP en el Programador de tareas de Windows.
Utiliza la cuenta SYSTEM, se inicia al arrancar el servidor y reintenta hasta tres
veces si el proceso falla. El lanzamiento utiliza Node de 64 bits y guarda stdout
y stderr en logs/application.log. La carpeta debe permanecer en una ruta local
accesible para SYSTEM.

OpenFirewall crea una regla de entrada TCP para el puerto indicado, limitada a
LocalSubnet en perfiles Domain y Private. Si cambia PORT en el entorno, indique
el mismo valor con -Port. Una regla preexistente se conserva para revision del
administrador. Administre el acceso externo y HTTPS con la infraestructura del
servidor segun corresponda.

El recolector conserva la frecuencia GPS configurada y se ejecuta en el backend.
Su estado se controla con GPS_COLLECTION_ENABLED. GPS_EVIDENCE_ENABLED se activa
cuando su migracion correspondiente haya sido aprobada y aplicada.

## Actualizacion

```powershell
Set-Location C:\apps\rutasgp
Stop-ScheduledTask -TaskName RutasGP
git pull --ff-only
npm ci
npm run typecheck
npm test
npm run build:production
npm run verify:production
.\deployment\windows\Install-RutasGP.ps1
Invoke-RestMethod http://localhost:3000/api/health
```

Conserve la revision anterior y su configuracion para recuperar una entrega si
una actualizacion falla. Los cambios de datos y esquema requieren un plan propio.
El instalador valida que una tarea anterior este detenida antes de reemplazarla.

## Validacion en el servidor

Compruebe flota, historial, recorridos y Pedidos desde un navegador de la red.
Las rutas React deben abrir directamente y soportar recarga. Confirme acceso a
SQL Server y al Linked Server [10.10.1.3,1433] desde la base secundaria.
La prueba de produccion revisa web, API, autenticacion, assets y lectura SQL. La
instalacion de la tarea, firewall y conectividad desde otros equipos se verifica
en el servidor de destino al ejecutar estos pasos.

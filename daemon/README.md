# Servicio de Distribucion Rutas

Este daemon ejecuta scripts/start-production.mjs como servicio DistribucionRutas.
Utiliza WinSW 2.12.0 x64, descargado del proyecto oficial y comprobado mediante
SHA256. La configuracion pertenece a este proyecto.

El servicio usa LocalSystem, arranque automatico diferido y reinicio a los 30
segundos tras un fallo. Lee el entorno con las mismas prioridades del arranque
de produccion. Fuerza HOST=0.0.0.0 y PORT=3002. La clave y las credenciales
permanecen en api/.env o en el archivo de produccion configurado.

## Instalacion

Se requieren Node x64, ODBC Driver 17 x64, dependencias instaladas, API y web
compiladas. El puerto 3002 debe estar libre. Detenga con Ctrl+C la ejecucion manual
de Node y conserve detenido el sitio IIS que tenia ese enlace.

Desde PowerShell como administrador en el servidor ejecute lo siguiente.

```powershell
Set-Location C:\inetpub\wwwroot\distribucion_rutas
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\daemon\servicio.ps1 -Accion Instalar
Invoke-RestMethod http://127.0.0.1:3002/api/health
Get-Content .\daemon\logs\distribucionrutas.out.log -Tail 30
Get-Content .\daemon\logs\distribucionrutas.err.log -Tail 30
```

El parametro de ejecucion se aplica solamente a ese proceso de PowerShell.
La instalacion registra e inicia el servicio. El puerto y el acceso al firewall
se administran con la configuracion existente del servidor.

## Administracion

```powershell
.\daemon\servicio.ps1 -Accion Estado
.\daemon\servicio.ps1 -Accion Detener
.\daemon\servicio.ps1 -Accion Iniciar
.\daemon\servicio.ps1 -Accion Reiniciar
.\daemon\servicio.ps1 -Accion Desinstalar
```

Desinstalar retira el servicio y conserva el proyecto, logs y datos SQL.
Para actualizar, detenga el servicio, actualice y compile, luego inicie nuevamente.
La cuenta LocalSystem debe poder leer el proyecto y escribir daemon/logs.
Los logs stdout y stderr rotan a 10 MB con ocho archivos de respaldo por flujo.

## Preparacion y validacion

Preparar descarga el wrapper y genera XML con la ruta local de Node sin registrar
un servicio. La instalacion verifica puerto, compilados, ODBC y carga del entorno.
La salud HTTP comprueba el servidor web. Compruebe tambien un ciclo de recoleccion
GPS exitoso y la lectura de Pedidos para validar las dependencias SQL.

```powershell
.\daemon\servicio.ps1 -Accion Preparar
```

La parada intenta un cierre con Ctrl+C durante 60 segundos. Si el proceso no
finaliza en ese plazo, WinSW lo termina. La validacion de instalacion, reinicio
del servidor y acceso de red se realiza en el servidor de destino.

Documentacion del wrapper en https://github.com/winsw/winsw/tree/v2.12.0/doc.

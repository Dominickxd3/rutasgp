# Guía de entrega e instalación

Esta guía está pensada para **quien recibe el proyecto**. Sigue los pasos en
orden y en unos minutos tendrás el tablero funcionando en tu máquina.

> El proyecto incluye API (NestJS) y tablero web (React). Se instala una sola
> vez desde la carpeta raíz.

---

## 1. Requisitos

| Herramienta | Versión mínima | Cómo comprobar |
| --- | --- | --- |
| Node.js | **20.19** (recomendado 22 LTS) | `node -v` |
| npm | 10 | `npm -v` |
| Navegador | Chrome, Edge o Firefox actualizado | — |

> ⚠️ **Node 18 o 20.0–20.18 no funcionan.** Vite 7 exige `^20.19` o `>=22.12`.
> Si tienes una versión vieja, instala la LTS desde https://nodejs.org.

Si usas `nvm`, la versión correcta ya está fijada en el archivo `.nvmrc`:

```bash
nvm install   # lee .nvmrc
nvm use
```

---

## 2. Instalación

Desde la carpeta raíz del proyecto:

```bash
npm install
```

> **Importante:** ejecútalo en la raíz (donde está este `package.json`), **no**
> dentro de `api/` ni de `web/`. Es un monorepo con workspaces y `npm install`
> dentro de una subcarpeta rompe la instalación.

Después crea el archivo de configuración:

```bash
npm run setup
```

Esto copia `api/.env.example` a `api/.env` y **no sobrescribe** nada si ya
existe. En Windows no hace falta usar `copy` ni `cp`.

---

## 3. Arrancar

```bash
npm run dev
```

Se levantan los dos servicios a la vez:

| Servicio | URL |
| --- | --- |
| Tablero web | http://localhost:5173 |
| API | http://localhost:3000/api/fleet/units |
| Documentación | http://localhost:3000/api/docs |

El tablero se refresca solo cada 5 segundos.

### Comprobar que todo responde

En otra terminal, con `npm run dev` corriendo:

```bash
npm run verify
```

Salida esperada:

```
[ok] health      -> ok (uptime 12s)
[ok] fleet/units -> 27 unidades, 9 en movimiento

Todo correcto.
```

---

## 4. Problemas comunes

| Síntoma | Causa | Solución |
| --- | --- | --- |
| `npm error engine` o errores raros al instalar | Node demasiado viejo | Instala Node 22 LTS y borra `node_modules` + `package-lock.json`, luego `npm install` |
| `EADDRINUSE` en 3000 o 5173 | Otro proceso usa el puerto | Cierra el otro proceso o cambia `PORT` en `api/.env` |
| El tablero carga pero no hay unidades | La API no está corriendo | Revisa la terminal de `npm run dev`; debe decir `API de flota disponible en...` |
| `No se pudo conectar con la API de flota` | La API se cayó o cambió de puerto | Ejecuta `npm run verify` para ver el error real |
| La API responde `503` | El proveedor GPS no contesta y no hay cache | Espera unos segundos y reintenta; revisa tu conexión |
| `stale: true` en la respuesta | El GPS no respondió; se muestra la última posición | Normal y transitorio, no requiere acción |
| El GPS no responde nunca | Red bloquea el puerto 80 saliente o el proveedor restringe IP | Prueba desde otra red o pide que autoricen tu IP |
| Errores de tipos al compilar | Dependencias desalineadas | `npm install` en la raíz, no en subcarpetas |

### Ver la API directamente

```bash
curl http://localhost:3000/api/fleet/units
```

En PowerShell:

```powershell
Invoke-RestMethod http://localhost:3000/api/fleet/units
```

---

## 5. Configuración (opcional)

Todo vive en `api/.env`. Los valores por defecto ya funcionan, así que **solo
cambia lo que necesites**:

| Variable | Para qué sirve |
| --- | --- |
| `PORT` | Puerto de la API (por defecto 3000) |
| `FLEET_SOURCE_URL` | Cuenta/endpoint del proveedor GPS |
| `CACHE_TTL_MS` | Cuánto se reutiliza la última respuesta |
| `CORS_ORIGIN` | Dominios del tablero permitidos, separados por coma |
| `API_KEY` | **Déjala vacía.** Solo se usa si vas a exponer la API a terceros |

> En esta entrega **no se usa API key**: `API_KEY` va vacía y la API acepta
> peticiones sin autenticación. Es lo correcto para uso interno/local, pero
> **no publiques esta instancia en internet tal cual**: expone placas, clientes
> y coordenadas. Si algún día la publicas, mira `docs/DEPLOY.md`.

### Cambiar de cuenta del proveedor GPS

Edita `FLEET_SOURCE_URL` en `api/.env` con el `id_usuario` y `tipo_usuario`
que te correspondan. No hace falta tocar código.

---

## 6. Compilar para producción

```bash
npm run build     # genera api/dist y web/dist
npm run start     # arranca la API compilada en :3000
```

El contenido de `web/dist` se publica en cualquier hosting estático y se
redirige `/api` hacia la API (Nginx, Traefik, etc.).

Para Docker, Nginx con HTTPS y despliegue en Railway/Render/VPS, consulta
**[docs/DEPLOY.md](docs/DEPLOY.md)**.

---

## 7. Estructura del proyecto

```
.
├── api/                  # Backend NestJS
│   ├── src/
│   │   ├── fleet/        # Lógica de flota (controlador, servicio, DTOs)
│   │   ├── config/       # Lectura de variables de entorno
│   │   └── common/       # Guards y decoradores
│   ├── .env.example      # Plantilla de configuración
│   └── Dockerfile
├── web/                  # Tablero React + Leaflet
├── scripts/              # setup.mjs y verify.mjs
├── docs/DEPLOY.md        # Guía de despliegue
└── package.json          # Raíz del monorepo
```

---

## 8. Comandos disponibles

| Comando | Qué hace |
| --- | --- |
| `npm run setup` | Crea `api/.env` si no existe |
| `npm run dev` | API + web en modo desarrollo |
| `npm run verify` | Comprueba que la API responde |
| `npm run build` | Compila API y web |
| `npm run start` | Arranca la API compilada |
| `npm run typecheck` | Verifica tipos en ambos paquetes |

---

## 9. Checklist rápido

- [ ] `node -v` muestra 20.19 o superior (ideal 22.x)
- [ ] `npm install` ejecutado **en la raíz**
- [ ] `npm run setup` ejecutado
- [ ] `npm run dev` muestra la API y Vite sin errores
- [ ] http://localhost:5173 muestra el mapa con unidades
- [ ] `npm run verify` termina con `Todo correcto.`

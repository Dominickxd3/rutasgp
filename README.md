# Monitoreo de flota en tiempo real

Adaptación del visor Leaflet original a una aplicación tipada:

- **API:** NestJS + Node.js + TypeScript (proxy, normalización y cache del feed GPS)
- **Web:** React 18 + TypeScript + SCSS + PrimeReact + Leaflet
- **Mapa:** OpenStreetMap

## Arquitectura

```
api/  ->  GET /api/fleet/units  ->  MysqlRastreo.php (feed original)
web/  ->  consume /api/fleet/units cada 5 s y dibuja los marcadores
```

El frontend nunca llama al servidor GPS directamente. Esto evita el bloqueo por
CORS/mixed content (el feed es HTTP), oculta el `id_usuario` y permite cachear
las respuestas cuando varios operadores tienen el tablero abierto.

### Endpoints

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/fleet/units` | API key | Snapshot de la flota |
| `GET` | `/api/fleet/units?refresh=true` | API key | Fuerza consulta al GPS |
| `GET` | `/api/health` | pública | Healthcheck |
| `GET` | `/api/docs` | pública | Swagger UI |
| `GET` | `/api/docs-json` | pública | Contrato OpenAPI 3 |

La documentación interactiva está en **http://localhost:3000/api/docs**.

### Autenticación

Todas las rutas de `/api/fleet/*` requieren el header:

```http
x-api-key: <clave>
```

También se acepta `Authorization: Bearer <clave>`. La clave se define en
`API_KEY`; si está vacía el guard queda deshabilitado (solo para desarrollo
local). En producción es obligatoria.

Errores: `401` clave ausente/incorrecta, `429` rate limit excedido.

### Contrato de la API

`GET /api/fleet/units?refresh=true`

```json
{
  "units": [
    {
      "idUnidad": "1084",
      "placa": "CJS-722",
      "cliente": "GRUPO PECUARIO SAC",
      "estadoMotor": "Encendido",
      "motorEncendido": true,
      "velocidad": 22,
      "latitud": -12.0700016,
      "longitud": -76.9726266,
      "orientacion": 22,
      "bateria": 13.53,
      "kilometraje": 0,
      "fecha": "2026-10-21 12:35:13"
    }
  ],
  "total": 27,
  "moving": 3,
  "stopped": 24,
  "updatedAt": "2026-10-21T17:37:06.000Z",
  "stale": false
}
```

- El feed usa `action=listar_unidades_asignadas`, que entrega **todas** las
  unidades asignadas (27 al momento de la integración) con su última posición.
  `listar_unidades_asignadas_actual` solo devuelve las que reportaron en los
  últimos minutos; por eso el total variaba entre 4 y 12.
- Las 27 unidades se cargan de una sola vez (la tabla no pagina); el panel
  lateral tiene scroll propio.
- `listar_unidades_asignadas` no incluye el nombre del cliente. La API consulta
  en paralelo `listar_unidades_asignadas_actual` y guarda el mapeo
  unidad → cliente en memoria. Para unidades que nunca han reportado, el campo
  `cliente` es `null` y la interfaz simplemente lo omite.
- Las unidades sin coordenadas válidas se descartan.
- Si el proveedor falla, se devuelve la última copia con `"stale": true`.
- `refresh=true` fuerza la consulta (con un mínimo de 1.5 s entre llamadas).
- El frontend refresca automáticamente cada 5 s: no hace falta recargar la página.

## Requisitos

- Node.js >= 20.19 (recomendado 22 LTS; Vite 7 no soporta versiones anteriores)
- npm >= 10

## Puesta en marcha

```bash
npm install          # en la raíz, no dentro de api/ ni web/
npm run setup        # crea api/.env desde api/.env.example (Windows-friendly)
npm run dev
```

- Web: http://localhost:5173
- API: http://localhost:3000/api/fleet/units
- Docs: http://localhost:3000/api/docs

Comprueba que todo responde con `npm run verify`.

> ¿Vas a entregar el proyecto a otra persona? Usa
> **[GUIA_ENTREGA.md](GUIA_ENTREGA.md)**: instalación paso a paso y solución de
> problemas comunes.

## Scripts

| Comando            | Descripción                             |
| ------------------ | --------------------------------------- |
| `npm run setup`    | Crea `api/.env` si no existe            |
| `npm run dev`      | API con watch + Vite en paralelo        |
| `npm run verify`   | Comprueba que la API responde           |
| `npm run build`    | Compila NestJS y el bundle de React     |
| `npm run typecheck`| Verifica tipos en ambos paquetes        |
| `npm run start`    | Arranca la API ya compilada             |

## Variables de entorno (`api/.env`)

| Variable                | Default | Descripción                          |
| ----------------------- | ------- | ------------------------------------ |
| `PORT`                  | `3000`  | Puerto de NestJS                     |
| `CORS_ORIGIN`           | `http://localhost:5173` | Orígenes permitidos (separados por coma) |
| `API_KEY`               | *(vacía)* | Clave para `x-api-key`. **Obligatoria en producción** |
| `TRUST_PROXY`           | `false` | `true` detrás de Nginx/balanceador   |
| `SWAGGER_ENABLED`       | `true`  | Publica `/api/docs`                  |
| `THROTTLE_TTL_MS`       | `60000` | Ventana del rate limit               |
| `THROTTLE_LIMIT`        | `120`   | Peticiones por IP y ventana          |
| `FLEET_SOURCE_URL`      | `listar_unidades_asignadas` | URL completa del proveedor GPS (27 unidades) |
| `FLEET_LIVE_SOURCE_URL` | derivada de `FLEET_SOURCE_URL` | Feed de posiciones actuales (solo para nombres de cliente) |
| `UPSTREAM_TIMEOUT_MS`   | `10000` | Timeout de la petición al GPS        |
| `CACHE_TTL_MS`          | `4000`  | Vigencia del cache en el servidor    |
| `POLL_MIN_INTERVAL_MS`  | `1500`  | Mínimo entre refrescos forzados      |

Genera una clave con:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Si el proveedor cambia de usuario o endpoint, solo se edita `FLEET_SOURCE_URL`.

## Producción

Guía completa (Docker, Nginx, Railway/Render, HTTPS, rotación de claves y
ejemplos de consumo en curl/Node/Python): **[docs/DEPLOY.md](docs/DEPLOY.md)**.

Resumen:

```bash
npm run build
npm run start          # sirve la API en :3000
```

Con Docker:

```bash
docker build -f api/Dockerfile -t flota-api .
docker run -p 3000:3000 --env-file api/.env flota-api
```

Publica `web/dist` en cualquier hosting estático y enruta `/api` hacia NestJS
(Nginx, Traefik, etc.). Para apuntar a otra URL de API sin proxy:

```bash
# web/.env.production
VITE_API_BASE_URL=https://api.tudominio.com/api
```

> Si activas `API_KEY`, el dashboard no puede enviarla desde el navegador.
> Configura Nginx para inyectar el header en el proxy (ver `docs/DEPLOY.md` §4).

## Notas

- El feed original devuelve datos personales de clientes. Define `API_KEY`
  antes de exponer la API en cualquier entorno público.
- `id_usuario` queda únicamente en el servidor; el frontend nunca lo ve.
- La rotación del camión usa el campo `orientacion` del proveedor.

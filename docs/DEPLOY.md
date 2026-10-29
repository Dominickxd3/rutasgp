# Guía: publicar y consumir la API

Esta guía cubre los dos escenarios: **entregar el proyecto completo** para que
otro equipo lo despliegue, y **publicar solo la API** para que la consuman
desde otro backend.

---

## 1. Qué entregar

### Escenario A — Publicar solo la API (recomendado para externos)

Entregas únicamente:

| Dato | Ejemplo |
| --- | --- |
| URL base | `https://flota.tudominio.com/api` |
| Clave | `9f2c...` (por un canal seguro, no por correo) |
| Documentación | `https://flota.tudominio.com/api/docs` |
| Healthcheck | `https://flota.tudominio.com/api/health` |

La otra persona **no ve tu código ni el `id_usuario` del GPS**.

### Escenario B — Entregar el proyecto completo

Entregas el repositorio **más** un `api/.env` real (o las credenciales del
proveedor GPS por separado). Recuerda que `.gitignore` excluye `.env`: si
mandas solo el repo por Git, no funcionará hasta que definan ese archivo.

> ⚠️ Quien reciba el proyecto obtiene acceso a tu cuenta del proveedor GPS
> (`id_usuario`). Si eso no es aceptable, usa el escenario A.

---

## 2. Consumir la API

### curl

```bash
curl -H "x-api-key: TU_CLAVE" \
     https://flota.tudominio.com/api/fleet/units
```

### JavaScript / TypeScript (Node 18+)

```ts
const res = await fetch('https://flota.tudominio.com/api/fleet/units', {
  headers: { 'x-api-key': process.env.FLEET_API_KEY! },
});

if (!res.ok) {
  throw new Error(`HTTP ${res.status}`);
}

const snapshot = await res.json();
console.log(snapshot.total, 'unidades');
```

### Python

```python
import os
import requests

res = requests.get(
    "https://flota.tudominio.com/api/fleet/units",
    headers={"x-api-key": os.environ["FLEET_API_KEY"]},
    timeout=15,
)
res.raise_for_status()
snapshot = res.json()
print(snapshot["total"], "unidades")
```

### Notas de integración

- **No hace falta llamar cada segundo.** El snapshot se cachea 4 s por defecto;
  un intervalo de 5–15 s es suficiente.
- `refresh=true` fuerza consulta al GPS, pero el servidor aplica un mínimo de
  1,5 s (`POLL_MIN_INTERVAL_MS`). Abusar de este parámetro no acelera nada.
- Si `stale` es `true`, el proveedor GPS no respondió y estás viendo la última
  posición conocida. El campo `warning` trae el detalle.
- `cliente` puede ser `null`: significa que esa unidad nunca apareció en el
  feed de posiciones actuales.
- Los errores vienen en JSON con el formato estándar de NestJS:
  `{ "statusCode": 401, "message": "...", "error": "Unauthorized" }`.

### Códigos de estado

| Código | Significado |
| --- | --- |
| `200` | OK |
| `401` | Falta la API key o es inválida |
| `429` | Se superó el rate limit (`THROTTLE_LIMIT`) |
| `503` | No hay cache y el proveedor GPS no responde |

---

## 3. Desplegar

### 3.1 Docker (cualquier hosting)

```bash
docker build -f api/Dockerfile -t flota-api .

docker run -d --name flota-api -p 3000:3000 \
  -e API_KEY="$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")" \
  -e TRUST_PROXY=true \
  -e FLEET_SOURCE_URL="http://gyztec.sergps.com/...&id_usuario=464&tipo_usuario=usuario&tipo=Ubicacion" \
  flota-api
```

El contenedor corre como usuario `node` (no root) e incluye un `HEALTHCHECK`
contra `/api/health`.

### 3.2 Railway / Render / Fly.io

1. Conecta el repositorio.
2. **Root directory:** la raíz del repo (no `api/`).
3. **Build command:** `npm run build -w api`
4. **Start command:** `node api/dist/main`
5. Define las variables de entorno del punto 4.

Estos servicios ya ponen la app detrás de un proxy: define `TRUST_PROXY=true`
para que el rate limit vea la IP real.

### 3.3 VPS con Nginx + systemd

`/etc/systemd/system/flota-api.service`:

```ini
[Unit]
Description=API de flota
After=network.target

[Service]
WorkingDirectory=/opt/distribucion_rutas
EnvironmentFile=/opt/distribucion_rutas/api/.env
ExecStart=/usr/bin/node api/dist/main
Restart=always
User=www-data

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable --now flota-api
```

---

## 4. Nginx: HTTPS, API key y dashboard

El dashboard web **no puede guardar una API key** (cualquiera la vería en el
navegador). La solución es que Nginx la inyecte al hacer proxy. Así el navegador
nunca ve la clave y la API sigue protegida para el resto del mundo.

```nginx
server {
    listen 443 ssl;
    server_name flota.tudominio.com;

    ssl_certificate     /etc/letsencrypt/live/flota.tudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/flota.tudominio.com/privkey.pem;

    # Dashboard (React compilado)
    root /var/www/flota;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API para el dashboard: Nginx añade la clave.
    # Requiere que este bloque esté protegido por tu propio login/VPN,
    # porque quien llegue a /api obtendrá datos aunque no vea la clave.
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header x-api-key         "TU_CLAVE";
    }

    # Documentación: opcional, puedes cerrarla al público.
    location /api/docs {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
    }
}
```

> Si no quieres que el dashboard quede accesible, protégelo con
> `auth_basic` o restringe `location /` por IP/VPN.

---

## 5. Generar y rotar la clave

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Guarda la clave en el gestor de secretos del hosting, **nunca en Git**.
- Para rotarla: cambia `API_KEY`, reinicia el servicio y avisa al consumidor.
  No hay downtime si el consumidor puede reintentar.
- Para dar acceso a varias personas, pon varias claves separadas por coma y
  compara contra la lista. (Hoy el guard soporta una sola; es el siguiente paso
  natural si necesitas revocar accesos individualmente.)

---

## 6. Checklist antes de publicar

- [ ] `API_KEY` definida y con al menos 32 caracteres aleatorios.
- [ ] HTTPS activo (el feed del GPS es HTTP, pero tu API debe ir por TLS).
- [ ] `TRUST_PROXY=true` si hay Nginx/balanceador delante.
- [ ] `CORS_ORIGIN` con dominios explícitos, nunca `*`.
- [ ] `SWAGGER_ENABLED=false` si no quieres publicar la documentación.
- [ ] `GET /api/health` responde `200`.
- [ ] `GET /api/fleet/units` sin clave responde `401`.
- [ ] El firewall solo expone 443 (y 80 para el redirect), nunca 3000.
- [ ] Revisado que el `id_usuario` del GPS no aparezca en el frontend.

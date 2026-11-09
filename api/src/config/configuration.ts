const DEFAULT_FLEET_SOURCE_URL =
  'http://gyztec.sergps.com/plataforma/dao/MysqlRastreo.php' +
  '?action=listar_unidades_asignadas&id_usuario=464' +
  '&tipo_usuario=usuario&tipo=Ubicacion';

function toInt(value: string | undefined, fallback: number, min = 0): number {
  const parsed = Number.parseInt(value ?? '', 10);

  return Number.isFinite(parsed) && parsed >= min ? parsed : fallback;
}

function toBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}

/**
 * El feed de "unidades asignadas" no incluye el nombre del cliente.
 * El feed "actual" sí lo incluye, pero solo para las unidades que
 * reportaron hace pocos minutos. Se usa como complemento.
 */
function deriveLiveSourceUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    url.searchParams.set('action', 'listar_unidades_asignadas_actual');

    return url.toString();
  } catch {
    return sourceUrl;
  }
}

export default () => {
  const sourceUrl =
    process.env.FLEET_SOURCE_URL?.trim() || DEFAULT_FLEET_SOURCE_URL;

  return {
    port: toInt(process.env.PORT, 3000, 1),
    host: process.env.HOST?.trim() || '0.0.0.0',
    serveWeb: toBool(process.env.SERVE_WEB, process.env.NODE_ENV === 'production'),
    corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    // Vacía = API abierta (solo para desarrollo local).
    apiKey: process.env.API_KEY?.trim() || '',
    trustProxy: toBool(process.env.TRUST_PROXY, false),
    swaggerEnabled: toBool(process.env.SWAGGER_ENABLED, true),
    throttle: {
      ttlMs: toInt(process.env.THROTTLE_TTL_MS, 60_000, 1_000),
      limit: toInt(process.env.THROTTLE_LIMIT, 120, 1),
    },
    fleet: {
      sourceUrl,
      liveSourceUrl:
        process.env.FLEET_LIVE_SOURCE_URL?.trim() ||
        deriveLiveSourceUrl(sourceUrl),
      timeoutMs: toInt(process.env.UPSTREAM_TIMEOUT_MS, 10_000, 1_000),
      cacheTtlMs: toInt(process.env.CACHE_TTL_MS, 4_000, 1_000),
      pollMinIntervalMs: toInt(process.env.POLL_MIN_INTERVAL_MS, 1_500, 500),
    },
    database: {
      host: process.env.GPS_DB_HOST?.trim() || '',
      port: toInt(process.env.GPS_DB_PORT, 1433, 1),
      name: process.env.GPS_DB_NAME?.trim() || 'DB_GP_DistribucionML',
      user: process.env.GPS_DB_USER?.trim() || '',
      password: process.env.GPS_DB_PASSWORD || '',
      encrypt: toBool(process.env.GPS_DB_ENCRYPT, false),
      trustServerCertificate: toBool(
        process.env.GPS_DB_TRUST_SERVER_CERTIFICATE,
        true,
      ),
    },
    collection: {
      enabled: toBool(process.env.GPS_COLLECTION_ENABLED, true),
      intervalSeconds: toInt(
        process.env.GPS_COLLECTION_INTERVAL_SECONDS,
        30,
        10,
      ),
      lockTimeoutMs: toInt(process.env.GPS_COLLECTION_LOCK_TIMEOUT_MS, 0, 0),
    },
    history: {
      defaultPageSize: toInt(process.env.GPS_HISTORY_PAGE_SIZE, 1_000, 1),
      maxPageSize: toInt(process.env.GPS_HISTORY_MAX_PAGE_SIZE, 5_000, 100),
      gapSeconds: toInt(process.env.GPS_HISTORY_GAP_SECONDS, 180, 30),
      stopSeconds: toInt(process.env.GPS_HISTORY_STOP_SECONDS, 180, 30),
      stopRadiusMeters: toInt(process.env.GPS_HISTORY_STOP_RADIUS_METERS, 40, 5),
      stopMaximumSpeedKmh: toInt(process.env.GPS_HISTORY_STOP_MAX_SPEED_KMH, 3, 0),
      stopMaximumHeartbeatSeconds: toInt(process.env.GPS_HISTORY_STOP_MAX_HEARTBEAT_SECONDS, 900, 60),
    },
    osrm: {
      enabled: toBool(process.env.OSRM_ENABLED, true),
      baseUrl: process.env.OSRM_BASE_URL?.trim() || 'https://router.project-osrm.org',
      timeoutMs: toInt(process.env.OSRM_TIMEOUT_MS, 8_000, 1_000),
      maxPoints: toInt(process.env.OSRM_MAX_POINTS, 10, 2),
      gpsRadiusMeters: toInt(process.env.OSRM_GPS_RADIUS_METERS, 35, 5),
      minimumConfidence: Number.parseFloat(process.env.OSRM_MIN_CONFIDENCE ?? '0.35'),
      concurrency: toInt(process.env.OSRM_CONCURRENCY, 5, 1),
      cacheTtlMs: toInt(process.env.OSRM_CACHE_TTL_MS, 600_000, 1_000),
    },
  };
};

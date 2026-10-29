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
  };
};

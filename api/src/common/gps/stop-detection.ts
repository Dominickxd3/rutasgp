export interface StopPoint {
  id?: number | bigint;
  latitude: number;
  longitude: number;
  speed: number | null;
  engine?: string | null;
  gpsDate: Date;
}

export type StopDetectionType = 'OBSERVADA' | 'PROBABLE';

export type StopLocationType = 'SEDE' | 'CLIENTE' | 'OTRA' | 'DESCONOCIDA';

export type StopConfidence = 'ALTA' | 'MEDIA' | 'BAJA';

export const STOP_ALGORITHM_VERSION = 'STOP_V1.1';

export interface DetectedGpsStop {
  startTime: Date;
  endTime: Date;
  durationSeconds: number;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  samples: number;

  // Trazabilidad de posiciones originales
  startPositionId?: number | bigint;
  endPositionId?: number | bigint;
  algorithmVersion: string;

  // Evidencia técnica de inmovilidad
  detectionType: StopDetectionType;
  locationType: StopLocationType;
  confidence: StopConfidence;
  confidenceReason: string;

  // Métricas espaciales y temporales
  distinctCoordinates: number;
  hasRepeatedCoordinates: boolean;
  distinctGpsTimestamps: number;
  maxGapSeconds: number;
  coverageRatioPct: number;
  engineState: 'Detenido' | 'Encendido' | 'Mixto' | 'Desconocido';
}

export interface StopDetectionOptions {
  radiusMeters: number;
  minimumSeconds: number;
  maximumSpeedKmh: number;
  maximumStationaryGapSeconds: number;
}

export function gpsDistanceMeters(
  a: Pick<StopPoint, 'latitude' | 'longitude'>,
  b: Pick<StopPoint, 'latitude' | 'longitude'>,
): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function summarize(candidate: StopPoint[], options: StopDetectionOptions): DetectedGpsStop | null {
  if (candidate.length < 2) return null;
  const start = candidate[0];
  const end = candidate[candidate.length - 1];
  const durationSeconds = Math.round((end.gpsDate.getTime() - start.gpsDate.getTime()) / 1_000);
  if (durationSeconds < options.minimumSeconds) return null;

  const latitude = candidate.reduce((sum, point) => sum + point.latitude, 0) / candidate.length;
  const longitude = candidate.reduce((sum, point) => sum + point.longitude, 0) / candidate.length;
  const center = { latitude, longitude };
  const radiusMeters = Math.max(...candidate.map((point) => gpsDistanceMeters(center, point)));
  if (radiusMeters > options.radiusMeters) return null;

  // 1. Análisis espacial: coordenadas distintas
  const coordKeys = new Set(candidate.map((p) => `${p.latitude.toFixed(6)},${p.longitude.toFixed(6)}`));
  const distinctCoordinates = coordKeys.size;
  const hasRepeatedCoordinates = distinctCoordinates === 1 && candidate.length >= 2;

  // 2. Análisis temporal satelital: timestamps únicos
  const timestampKeys = new Set(candidate.map((p) => p.gpsDate.getTime()));
  const distinctGpsTimestamps = timestampKeys.size;

  // 3. Continuidad temporal y saltos entre lecturas
  let maxGapSeconds = 0;
  let coveredDuration = 0;
  for (let i = 1; i < candidate.length; i += 1) {
    const gap = Math.round((candidate[i].gpsDate.getTime() - candidate[i - 1].gpsDate.getTime()) / 1_000);
    if (gap > maxGapSeconds) maxGapSeconds = gap;
    if (gap <= 90) coveredDuration += gap;
  }
  const coverageRatioPct =
    durationSeconds > 0
      ? Math.min(100, Math.round((coveredDuration / durationSeconds) * 100))
      : 100;

  // 4. Estado de motor dominante durante la inmovilidad
  const engines = candidate.map((p) => (p.engine || '').toLowerCase().trim());
  const detainedCount = engines.filter((e) => e.includes('detenido') || e.includes('apagado')).length;
  const runningCount = engines.filter((e) => e.includes('encendido') || e.includes('marcha')).length;
  let engineState: 'Detenido' | 'Encendido' | 'Mixto' | 'Desconocido' = 'Desconocido';
  if (detainedCount === candidate.length) engineState = 'Detenido';
  else if (runningCount === candidate.length) engineState = 'Encendido';
  else if (detainedCount > 0 && runningCount > 0) engineState = 'Mixto';
  else if (detainedCount > 0) engineState = 'Detenido';
  else if (runningCount > 0) engineState = 'Encendido';

  // 5. Evaluación de confianza multidimensional (no basada únicamente en cobertura)
  let confidence: StopConfidence = 'ALTA';
  let detectionType: StopDetectionType = 'OBSERVADA';
  let confidenceReason = 'Muestreo continuo y regular con lecturas frecuentes.';

  if (maxGapSeconds > 300) {
    confidence = 'BAJA';
    detectionType = 'PROBABLE';
    confidenceReason = `Salto prolongado de ${maxGapSeconds}s sin observaciones GPS continuas.`;
  } else if (maxGapSeconds > 90 || coverageRatioPct < 70) {
    confidence = 'MEDIA';
    detectionType = 'PROBABLE';
    confidenceReason = `Intervalos espaciados entre señales (máximo ${maxGapSeconds}s, cobertura ${coverageRatioPct}%).`;
  } else {
    confidence = 'ALTA';
    detectionType = 'OBSERVADA';
    if (hasRepeatedCoordinates) {
      confidenceReason = `Lecturas continuas cada ≤${maxGapSeconds}s con coordenadas fijas en reposo.`;
    } else {
      confidenceReason = `Lecturas continuas cada ≤${maxGapSeconds}s con dispersión satelital observada.`;
    }
  }

  return {
    startTime: start.gpsDate,
    endTime: end.gpsDate,
    durationSeconds,
    latitude,
    longitude,
    radiusMeters: Math.round(radiusMeters),
    samples: candidate.length,
    startPositionId: start.id,
    endPositionId: end.id,
    algorithmVersion: STOP_ALGORITHM_VERSION,
    detectionType,
    locationType: 'OTRA', // se refina posteriormente con geocercas de sede/cliente
    confidence,
    confidenceReason,
    distinctCoordinates,
    hasRepeatedCoordinates,
    distinctGpsTimestamps,
    maxGapSeconds,
    coverageRatioPct,
    engineState,
  };
}

/**
 * Detecta paradas GPS evaluando independientemente la evidencia de inmovilidad
 * de la clasificación geográfica/operativa, con métricas auditables para ML.
 */
export function detectGpsStops(points: StopPoint[], options: StopDetectionOptions): DetectedGpsStop[] {
  const ordered = [...points].sort((a, b) => a.gpsDate.getTime() - b.gpsDate.getTime());
  const stops: DetectedGpsStop[] = [];
  let candidate: StopPoint[] = [];

  const finish = () => {
    const stop = summarize(candidate, options);
    if (stop) stops.push(stop);
    candidate = [];
  };

  for (const point of ordered) {
    if (point.speed === null || point.speed > options.maximumSpeedKmh) {
      finish();
      continue;
    }

    if (candidate.length === 0) {
      candidate = [point];
      continue;
    }

    const previous = candidate[candidate.length - 1];
    const gap = (point.gpsDate.getTime() - previous.gpsDate.getTime()) / 1_000;
    const latitude = candidate.reduce((sum, item) => sum + item.latitude, 0) / candidate.length;
    const longitude = candidate.reduce((sum, item) => sum + item.longitude, 0) / candidate.length;
    const inRadius = gpsDistanceMeters({ latitude, longitude }, point) <= options.radiusMeters;

    // Un latido espaciado sigue siendo parte de la parada solo si permanece en el radio.
    if (!inRadius || gap > options.maximumStationaryGapSeconds) {
      finish();
      candidate = [point];
      continue;
    }

    candidate.push(point);
  }

  finish();
  return stops;
}

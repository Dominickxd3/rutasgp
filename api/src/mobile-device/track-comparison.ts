/**
 * Funciones puras para el recorrido de los celulares GPSCamiones y su
 * comparación con el GPS del camión. Sin dependencias de base de datos.
 */

export interface TrackPoint {
  latitude: number;
  longitude: number;
  time: number; // epoch ms
  speedKmh: number | null;
}

export interface TrackComparison {
  /** Km recorridos según el celular. */
  phoneKm: number;
  /** Km recorridos según el GPS del camión en el mismo periodo. */
  truckKm: number;
  /** Puntos del celular que tuvieron una lectura del camión cercana en el tiempo. */
  pairedSamples: number;
  averageSeparationM: number | null;
  maxSeparationM: number | null;
  /** % de lecturas emparejadas con el celular a menos de TOGETHER_RADIUS_M del camión. */
  togetherPct: number | null;
  /** Separación entre las últimas lecturas de ambos, si son recientes entre sí. */
  currentSeparationM: number | null;
}

/** Celular y camión se consideran "juntos" a esta distancia o menos. */
export const TOGETHER_RADIUS_M = 150;
/** Para emparejar lecturas, el camión debe haber reportado dentro de esta ventana. */
export const PAIR_WINDOW_MS = 90_000;

/**
 * Identidad estable del celular como vehículo en dbo.Vehiculos, derivada de su
 * código (ANDROID_ID). Así el recorrido pertenece al celular aunque no tenga
 * camión asignado, y nunca se mezcla con el GPS del camión. Rango
 * 800.000.000–899.999.998: no choca con el proveedor GPS (1000–2500) ni con el
 * rango 900.000.000+ que usaban las versiones anteriores de la app.
 */
export function phoneVehicleIdentity(deviceId: string): { providerUnitId: number; plate: string } {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(deviceId, 'utf8')) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return {
    providerUnitId: 800_000_000 + (hash % 99_999_999),
    plate: `CEL-${deviceId.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase()}`,
  };
}

export function distanceMeters(a: TrackPoint, b: TrackPoint): number {
  const rad = (value: number) => (value * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Km del recorrido. Ignora la deriva del GPS estando quieto (tramos < 5 m) y
 * saltos imposibles (> 180 km/h entre dos lecturas).
 */
export function trackKm(points: TrackPoint[]): number {
  let meters = 0;
  for (let i = 1; i < points.length; i++) {
    const d = distanceMeters(points[i - 1], points[i]);
    const seconds = (points[i].time - points[i - 1].time) / 1000;
    if (d < 5) continue;
    if (seconds > 0 && d / seconds > 50) continue;
    meters += d;
  }
  return Math.round(meters / 10) / 100;
}

/** Lectura del camión más cercana en el tiempo (búsqueda binaria). */
function nearestInTime(sorted: TrackPoint[], time: number): TrackPoint | null {
  if (sorted.length === 0) return null;
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sorted[mid].time < time) lo = mid + 1;
    else hi = mid;
  }
  const candidates = [sorted[lo], sorted[lo - 1]].filter(Boolean) as TrackPoint[];
  const best = candidates.reduce((x, y) => (Math.abs(x.time - time) <= Math.abs(y.time - time) ? x : y));
  return Math.abs(best.time - time) <= PAIR_WINDOW_MS ? best : null;
}

export function compareTracks(phone: TrackPoint[], truck: TrackPoint[]): TrackComparison {
  const phoneSorted = [...phone].sort((a, b) => a.time - b.time);
  const truckSorted = [...truck].sort((a, b) => a.time - b.time);
  const separations: number[] = [];
  for (const point of phoneSorted) {
    const match = nearestInTime(truckSorted, point.time);
    if (match) separations.push(distanceMeters(point, match));
  }
  const lastPhone = phoneSorted.at(-1);
  const lastTruck = truckSorted.at(-1);
  const current = lastPhone && lastTruck && Math.abs(lastPhone.time - lastTruck.time) <= PAIR_WINDOW_MS * 2
    ? Math.round(distanceMeters(lastPhone, lastTruck))
    : null;

  return {
    phoneKm: trackKm(phoneSorted),
    truckKm: trackKm(truckSorted),
    pairedSamples: separations.length,
    averageSeparationM: separations.length
      ? Math.round(separations.reduce((sum, value) => sum + value, 0) / separations.length)
      : null,
    maxSeparationM: separations.length ? Math.round(Math.max(...separations)) : null,
    togetherPct: separations.length
      ? Math.round((separations.filter((value) => value <= TOGETHER_RADIUS_M).length / separations.length) * 100)
      : null,
    currentSeparationM: current,
  };
}

/** Reduce el recorrido a como máximo `max` puntos para enviarlo al mapa. */
export function downsample<T>(points: T[], max: number): T[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => points[Math.round(i * step)]);
}

import type { GeofenceAppearance, GeofenceRecord } from '../types/geofence.types';
import { GEOFENCE_COLORS } from '../config/geofence.config';
export function validGeofenceColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[a-f0-9]{6}$/i.test(value);
}
export function geofenceAppearance(record?: GeofenceRecord | null): GeofenceAppearance {
  const purpose = record?.sedeNombre ? 'sede' : record?.purpose ?? 'zona';
  return { name: record?.name ?? '', purpose,
    color: validGeofenceColor(record?.color) ? record.color : record?.purpose ? GEOFENCE_COLORS[purpose] : GEOFENCE_COLORS.sede };
}

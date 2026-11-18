export const MOBILE_EVENT_TYPES = ['STOP_START', 'STOP_END', 'GEOFENCE_ENTER', 'GEOFENCE_EXIT'] as const;
export type MobileEventType = (typeof MOBILE_EVENT_TYPES)[number];

/** Clasificación inferida por el celular. Ninguna confirma una entrega. */
export const MOBILE_STOP_TYPES = ['POSIBLE_ENTREGA', 'TRAFICO', 'NO_PROGRAMADA', 'BASE'] as const;
export type MobileStopType = (typeof MOBILE_STOP_TYPES)[number];

export interface MobileEvent {
  id: string;
  type: MobileEventType;
  timestamp: number;
  latitude: number;
  longitude: number;
  recordedOffline: boolean;
  stopType: MobileStopType | null;
  startTimestamp: number | null;
  endTimestamp: number | null;
  durationSeconds: number | null;
  routeId: number | null;
  routeStopId: number | null;
  geofenceId: string | null;
  geofenceType: string | null;
  placeName: string | null;
}

export interface MobileEventBatch {
  deviceId: string;
  providerUnitId: number;
  plate: string;
  events: MobileEvent[];
}

export interface MobileEventBatchResult {
  processedIds: string[];
  inserted: number;
  duplicates: number;
}

/** Respuesta de GET /api/mobile/device/config (contrato de la app GPSCamiones). */
export interface MobileDeviceConfig {
  assigned: boolean;
  configVersion: string;
  vehicle: { providerUnitId: number; plate: string; name: string } | null;
  route: null;
  geofences: Array<{
    id: string;
    name: string;
    type: 'BASE';
    shape: 'polygon';
    points: Array<[number, number]>;
  }>;
}

export interface MobileDeviceRow {
  deviceId: string;
  model: string | null;
  lastUser: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  vehicleId: number | null;
  plate: string | null;
  providerUnitId: number | null;
  assignedBy: string | null;
  assignedAt: string | null;
  active: boolean;
}

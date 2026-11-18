import { API_BASE_URL } from '../../flota/services/fleet.service';

const configuredApiKey = import.meta.env.VITE_API_KEY?.trim();

export interface MobileDevice {
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

export interface AssignableVehicle {
  id: number;
  providerId: number;
  plate: string;
  active: boolean;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(configuredApiKey ? { 'x-api-key': configuredApiKey } : {}),
      },
    });
  } catch {
    throw new Error('No se pudo conectar con la API. Verifica que el servidor esté en línea.');
  }
  if (!response.ok) {
    let detail: string | null = null;
    try {
      const body = (await response.json()) as { message?: unknown };
      detail = typeof body.message === 'string' ? body.message : null;
    } catch {
      detail = null;
    }
    throw new Error(detail ?? `La API respondió con HTTP ${response.status}.`);
  }
  return (await response.json()) as T;
}

export function fetchMobileDevices(): Promise<MobileDevice[]> {
  return request<MobileDevice[]>('/mobile/devices');
}

export function fetchAssignableVehicles(): Promise<AssignableVehicle[]> {
  return request<AssignableVehicle[]>('/orders/vehicles');
}

export function assignMobileDevice(deviceId: string, vehicleId: number | null): Promise<MobileDevice> {
  return request<MobileDevice>(`/mobile/devices/${encodeURIComponent(deviceId)}/vehicle`, {
    method: 'PUT',
    body: JSON.stringify({ vehicleId }),
  });
}

export type LiveTrackPoint = [number, number, number];

export interface LiveTrack {
  vehicleId: number;
  plate: string;
  last: { latitude: number; longitude: number; time: string; speedKmh: number | null } | null;
  trail: LiveTrackPoint[];
  /** Recorrido ajustado a calles (OSRM). Null mientras se calcula. */
  road: Array<{ coordinates: [number, number][]; kind: 'matched' | 'estimated' }> | null;
}

export interface TrackComparison {
  phoneKm: number;
  truckKm: number;
  pairedSamples: number;
  averageSeparationM: number | null;
  maxSeparationM: number | null;
  togetherPct: number | null;
  currentSeparationM: number | null;
}

export interface MobileLiveDevice {
  deviceId: string;
  model: string | null;
  lastUser: string | null;
  lastSeenAt: string;
  phone: LiveTrack | null;
  truck: LiveTrack | null;
  comparison: TrackComparison | null;
  phoneKm: number;
  stops: Record<string, number>;
  stopList: Array<{ latitude: number; longitude: number; type: string; start: string | null; durationSeconds: number | null; place: string | null }>;
}

export interface MobileLiveResult {
  from: string;
  to: string;
  devices: MobileLiveDevice[];
}

/** Recorrido de hoy (desde las 00:00 de Lima) de los celulares y sus camiones. */
export function fetchMobileLive(signal?: AbortSignal): Promise<MobileLiveResult> {
  return request<MobileLiveResult>('/mobile/live', { signal });
}

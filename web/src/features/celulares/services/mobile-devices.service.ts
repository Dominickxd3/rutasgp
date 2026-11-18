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

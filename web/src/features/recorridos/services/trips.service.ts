import {
  API_BASE_URL,
  FleetApiError,
} from '../../flota/services/fleet.service';
import type { TripRecord, TripsAuditReport } from '../types/trip.types';

const apiKey = import.meta.env.VITE_API_KEY?.trim();

function headers(): HeadersInit {
  return {
    Accept: 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  };
}

export async function fetchDailyTrips(
  filters?: { date?: string; vehicleId?: number; estado?: string },
  signal?: AbortSignal,
): Promise<TripRecord[]> {
  const params = new URLSearchParams();
  if (filters?.date) params.set('date', filters.date);
  if (filters?.vehicleId) params.set('vehicleId', String(filters.vehicleId));
  if (filters?.estado) params.set('estado', filters.estado);

  const query = params.toString();
  const url = `${API_BASE_URL}/trips${query ? `?${query}` : ''}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal,
      cache: 'no-store',
      headers: headers(),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new FleetApiError(
      'No se pudo conectar con el servicio de recorridos.',
    );
  }

  if (!response.ok) {
    throw new FleetApiError(
      `Error al consultar recorridos (HTTP ${response.status}).`,
      response.status,
    );
  }

  return response.json() as Promise<TripRecord[]>;
}

export async function fetchTripsAudit(
  signal?: AbortSignal,
): Promise<TripsAuditReport> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/trips/audit`, {
      signal,
      cache: 'no-store',
      headers: headers(),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new FleetApiError('No se pudo consultar la auditoría de recorridos.');
  }

  if (!response.ok) {
    throw new FleetApiError(
      `Error al auditar recorridos (HTTP ${response.status}).`,
      response.status,
    );
  }

  return response.json() as Promise<TripsAuditReport>;
}

export async function triggerConsolidation(): Promise<{
  totalTrips: number;
  totalStops: number;
  totalTripsCreated?: number;
  totalStopsUpdated?: number;
  totalStopsDeleted?: number;
}> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/trips/consolidate`, {
      method: 'POST',
      headers: headers(),
    });
  } catch {
    throw new FleetApiError(
      'No se pudo ejecutar la consolidación de recorridos.',
    );
  }

  if (!response.ok) {
    throw new FleetApiError(
      `Error al consolidar recorridos (HTTP ${response.status}).`,
      response.status,
    );
  }

  return response.json() as Promise<{
    totalTrips: number;
    totalStops: number;
    totalTripsCreated?: number;
    totalStopsUpdated?: number;
    totalStopsDeleted?: number;
  }>;
}

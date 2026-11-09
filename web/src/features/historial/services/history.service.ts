import {
  API_BASE_URL,
  FleetApiError,
} from '../../flota/services/fleet.service';
import { normalizeHistoryRange } from '../../../lib/historyRange';
import type { HistoryResult, HistoryVehicle } from '../types/history.types';

const apiKey = import.meta.env.VITE_API_KEY?.trim();

function headers(): HeadersInit {
  return {
    Accept: 'application/json',
    ...(apiKey ? { 'x-api-key': apiKey } : {}),
  };
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      signal,
      cache: 'no-store',
      headers: headers(),
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new FleetApiError('No se pudo consultar el historial GPS.');
  }
  if (!response.ok)
    throw new FleetApiError(
      `No se pudo consultar el historial (HTTP ${response.status}).`,
      response.status,
    );
  return response.json() as Promise<T>;
}

export function fetchHistoryVehicles(
  signal?: AbortSignal,
): Promise<HistoryVehicle[]> {
  return getJson('/history/vehicles', signal);
}

export function fetchHistoryPositions(
  vehicleId: number,
  from: Date,
  to: Date,
  signal?: AbortSignal,
): Promise<HistoryResult> {
  const range = normalizeHistoryRange(from, to);
  const params = new URLSearchParams({
    vehicleId: String(vehicleId),
    from: range.from.toISOString(),
    to: range.to.toISOString(),
    page: '1',
    pageSize: '5000',
  });
  return getJson(`/history/positions?${params}`, signal);
}

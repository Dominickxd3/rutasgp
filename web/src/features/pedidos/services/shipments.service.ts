import { API_BASE_URL } from '../../flota/services/fleet.service';
import type { LocalOrderVehicle, ShipmentPage } from '../types/shipment.types';
const key = import.meta.env.VITE_API_KEY?.trim();

export async function getOrders<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/orders/${path}`, { signal, cache: 'no-store',
    headers: { Accept: 'application/json', ...(key ? { 'x-api-key': key } : {}) } });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    throw new Error(typeof body?.message === 'string' ? body.message
      : `No se pudo consultar el ERP (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}
export function fetchOrderVehicles(signal: AbortSignal) {
  return getOrders<LocalOrderVehicle[]>('vehicles', signal);
}
export async function fetchShipments(date: string, vehicleId: number | null, after: number, signal: AbortSignal) {
  const query = new URLSearchParams({ from: date, to: date, after: String(after) });
  if (vehicleId !== null) query.set('vehicleId', String(vehicleId));
  const result = await getOrders<ShipmentPage>(`shipments?${query}`, signal);
  if (!Array.isArray(result.items) || result.metadata?.source !== 'ERP_GUIAS') throw new Error('Respuesta de guías no reconocida.');
  return result;
}

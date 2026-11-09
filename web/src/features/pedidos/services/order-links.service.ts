import { API_BASE_URL } from '../../flota/services/fleet.service';
import { getOrders } from './shipments.service';
import type { CandidatePage, ConfirmOrderLink } from '../types/order-links.types';
const key = import.meta.env.VITE_API_KEY?.trim();

export function fetchOrderCandidates(guideId: number, orderId: number | null, signal: AbortSignal) {
  return getOrders<CandidatePage>(`order-links/${guideId}${orderId ? `?orderId=${orderId}` : ''}`, signal);
}

async function post(path: string, body: unknown, signal: AbortSignal) {
  const response = await fetch(`${API_BASE_URL}/orders/order-links/${path}`, {
    method: 'POST', signal, headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(error?.message ?? `No se pudo guardar el vínculo (HTTP ${response.status}).`);
  }
}
export function confirmOrderLink(guideId: number, body: ConfirmOrderLink, signal: AbortSignal) {
  return post(String(guideId), body, signal);
}
export function revokeOrderLink(guideId: number, linkId: number, evidence: string, reviewer: string, signal: AbortSignal) {
  return post(`${guideId}/${linkId}/revoke`, { evidence, reviewer }, signal);
}

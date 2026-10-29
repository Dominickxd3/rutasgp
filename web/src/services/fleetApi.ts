import type { FleetSnapshot } from '../types/fleet';

const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export const API_BASE_URL = (
  configuredBaseUrl && configuredBaseUrl.length > 0
    ? configuredBaseUrl
    : '/api'
).replace(/\/+$/, '');

export class FleetApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'FleetApiError';
  }
}

function isFleetSnapshot(value: unknown): value is FleetSnapshot {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const candidate = value as Partial<FleetSnapshot>;

  return (
    Array.isArray(candidate.units) &&
    typeof candidate.total === 'number' &&
    typeof candidate.updatedAt === 'string'
  );
}

async function readErrorMessage(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { message?: unknown };
    const message = body?.message;

    if (Array.isArray(message)) {
      return message.map(String).join(', ');
    }

    return typeof message === 'string' ? message : null;
  } catch {
    return null;
  }
}

export async function fetchFleet(
  signal?: AbortSignal,
  refresh = false,
): Promise<FleetSnapshot> {
  const url = `${API_BASE_URL}/fleet/units${refresh ? '?refresh=true' : ''}`;

  let response: Response;

  try {
    response = await fetch(url, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }

    throw new FleetApiError(
      'No se pudo conectar con la API de flota. Verifica que el servidor esté en línea.',
    );
  }

  if (!response.ok) {
    const detail = await readErrorMessage(response);

    throw new FleetApiError(
      detail ?? `La API respondió con HTTP ${response.status}.`,
      response.status,
    );
  }

  const payload: unknown = await response.json();

  if (!isFleetSnapshot(payload)) {
    throw new FleetApiError('La API devolvió una respuesta inesperada.');
  }

  return payload;
}

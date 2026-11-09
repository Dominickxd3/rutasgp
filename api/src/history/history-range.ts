import { BadRequestException } from '@nestjs/common';

/** Ancho mínimo aplicado a una consulta con `from === to`. */
export const MIN_HISTORY_WINDOW_MS = 1;

/**
 * Valida y normaliza un intervalo de consulta histórica.
 *
 * - `to > from`: se devuelve tal cual.
 * - `to === from`: se amplía `to` en 1 ms para que la consulta sea ejecutable.
 * - `to < from`: es un intervalo invertido y se rechaza con un mensaje explícito.
 */
export function normalizeHistoryRange(from: Date, to: Date): { from: Date; to: Date } {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new BadRequestException('from y to deben ser fechas ISO válidas.');
  }
  if (toMs < fromMs) {
    throw new BadRequestException(
      `Intervalo inválido: to (${to.toISOString()}) es anterior a from (${from.toISOString()}).`,
    );
  }
  if (toMs === fromMs) return { from, to: new Date(toMs + MIN_HISTORY_WINDOW_MS) };
  return { from, to };
}

/** Ventana mínima que se consulta cuando `to` no es posterior a `from`. */
export const MIN_HISTORY_WINDOW_MS = 60_000;

/**
 * Garantiza que una consulta histórica tenga un intervalo ejecutable.
 *
 * Un recorrido recién iniciado puede tener `fechaFinUtc` igual o anterior a
 * `fechaInicioUtc` (por ejemplo, por desfase de reloj entre servidor y
 * navegador), lo que antes producía un 400. En ese caso se consulta una
 * ventana mínima de un minuto desde el inicio.
 */
export function normalizeHistoryRange(from: Date, to: Date): { from: Date; to: Date } {
  const fromMs = from.getTime();
  const toMs = to.getTime();
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    throw new Error('El intervalo de consulta no es válido.');
  }
  if (toMs > fromMs) return { from, to };
  return { from, to: new Date(fromMs + MIN_HISTORY_WINDOW_MS) };
}

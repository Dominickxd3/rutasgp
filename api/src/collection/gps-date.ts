const PROVIDER_DATE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/;

/** El proveedor devuelve hora de Perú sin zona. Perú usa UTC-05:00 sin DST. */
export function parseProviderDate(value: string | null): Date | null {
  if (!value) return null;
  const match = PROVIDER_DATE.exec(value.trim());
  if (!match) return null;

  const [, year, month, day, hour, minute, second, milliseconds = '0'] = match;
  const date = new Date(
    `${year}-${month}-${day}T${hour}:${minute}:${second}.${milliseconds.padEnd(3, '0')}-05:00`,
  );

  if (Number.isNaN(date.getTime())) return null;
  // Date normaliza fechas inexistentes (p.ej. 30 de febrero); rechazarlas.
  const local = new Date(date.getTime() - 5 * 3600_000).toISOString();
  return local.slice(0,19) === `${year}-${month}-${day}T${hour}:${minute}:${second}` ? date : null;
}

import { BadRequestException } from '@nestjs/common';

export function orderRange(from?: string, to?: string) {
  const valid = (value?: string) => !!value && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid(from) || !valid(to)) throw new BadRequestException('Fechas inválidas. Use AAAA-MM-DD.');
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (end < start || end - start > 6 * 86_400_000) {
    throw new BadRequestException('Seleccione entre uno y siete días.');
  }
  return { from: from!.replaceAll('-', ''), until: new Date(end + 86_400_000).toISOString().slice(0, 10).replaceAll('-', '') };
}

export function orderCursor(value?: string) {
  if (value === undefined) return 0;
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < 0 || number > 2147483647) {
    throw new BadRequestException('Identificador inválido.');
  }
  return number;
}

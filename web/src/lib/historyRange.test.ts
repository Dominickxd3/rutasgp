import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeHistoryRange } from './historyRange';

test('conserva un intervalo válido', () => {
  const from = new Date('2026-11-02T08:00:00.000Z');
  const to = new Date('2026-11-02T18:00:00.000Z');
  const range = normalizeHistoryRange(from, to);
  assert.equal(range.from.getTime(), from.getTime());
  assert.equal(range.to.getTime(), to.getTime());
});

test('amplía a un minuto cuando un recorrido tiene inicio y fin iguales', () => {
  const from = new Date('2026-11-02T08:00:00.000Z');
  const range = normalizeHistoryRange(from, new Date(from.getTime()));
  assert.equal(range.to.getTime(), from.getTime() + 60_000);
});

test('amplía a un minuto cuando el fin es anterior al inicio por desfase de reloj', () => {
  const from = new Date('2026-11-02T08:00:00.000Z');
  const to = new Date(from.getTime() - 5_000);
  const range = normalizeHistoryRange(from, to);
  assert.equal(range.from.getTime(), from.getTime());
  assert.equal(range.to.getTime(), from.getTime() + 60_000);
});

test('rechaza fechas inválidas antes de enviar la consulta', () => {
  assert.throws(() => normalizeHistoryRange(new Date('no-es-fecha'), new Date()), /intervalo de consulta/i);
});

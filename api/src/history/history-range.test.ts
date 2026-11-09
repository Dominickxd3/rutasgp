import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeHistoryRange } from './history-range';

test('conserva un intervalo con to posterior a from', () => {
  const from = new Date('2026-11-02T08:00:00.000Z');
  const to = new Date('2026-11-02T18:00:00.000Z');
  const range = normalizeHistoryRange(from, to);
  assert.equal(range.from.getTime(), from.getTime());
  assert.equal(range.to.getTime(), to.getTime());
});

test('amplía en 1 ms un intervalo con from igual a to', () => {
  const from = new Date('2026-11-02T08:00:00.000Z');
  const range = normalizeHistoryRange(from, new Date(from.getTime()));
  assert.equal(range.from.getTime(), from.getTime());
  assert.equal(range.to.getTime(), from.getTime() + 1);
});

test('rechaza un intervalo invertido con un mensaje explícito', () => {
  const from = new Date('2026-11-02T18:00:00.000Z');
  const to = new Date('2026-11-02T08:00:00.000Z');
  assert.throws(() => normalizeHistoryRange(from, to), /Intervalo inválido/);
});

test('rechaza fechas inválidas', () => {
  assert.throws(() => normalizeHistoryRange(new Date('no-es-fecha'), new Date()), /fechas ISO válidas/);
});

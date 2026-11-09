import assert from 'node:assert/strict';
import test from 'node:test';

import { parseProviderDate } from './gps-date';

test('convierte la hora local de Perú a UTC sin reemplazarla por la recepción', () => {
  assert.equal(parseProviderDate('2026-10-30 12:03:45')?.toISOString(), '2026-10-30T17:03:45.000Z');
});

test('rechaza fechas sin el formato del proveedor', () => {
  assert.equal(parseProviderDate('30/10/2026 12:03:45'), null);
  assert.equal(parseProviderDate(null), null);
});

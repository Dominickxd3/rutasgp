import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeFleet } from './fleet.mapper';

test('preserva datos GPS ausentes y velocidad decimal para almacenamiento', () => {
  const base = { id_unidad: 1, latitud: -12, longitud: -77 };
  const [missing] = normalizeFleet([base]);
  assert.equal(missing.velocidadOriginal, null);
  assert.equal(missing.orientacionOriginal, null);
  const [decimal] = normalizeFleet([{ ...base, speed: '2.75' }]);
  assert.equal(decimal.velocidadOriginal, 2.75);
});

test('conserva la lectura más reciente aunque el proveedor entregue filas desordenadas', () => {
  const base = { id_unidad: 1, latitud: -12, longitud: -77 };
  const [unit] = normalizeFleet([
    { ...base, fecha: '2026-11-02 10:05:00', speed: 25 },
    { ...base, fecha: '2026-11-02 10:00:00', speed: 0 },
  ]);
  assert.equal(unit.velocidadOriginal, 25);
});

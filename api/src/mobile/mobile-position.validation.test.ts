import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMobilePositionBatch } from './mobile-position.validation';

function validBatch() {
  const now = Date.now();
  return {
    deviceId: 'corporativo-001',
    providerUnitId: 1084,
    plate: 'cjs-722',
    points: [{
      id: '6df33c83-91ee-45e8-8608-78be1c4c824b',
      latitude: -12.046374,
      longitude: -77.042793,
      accuracyMeters: 5.2,
      speedMetersPerSecond: 10,
      gpsTimestamp: now,
      recordedTimestamp: now,
      mock: false,
    }],
  };
}

test('normaliza placa y acepta un lote GPS corporativo válido', () => {
  const parsed = parseMobilePositionBatch(validBatch());
  assert.equal(parsed.plate, 'CJS-722');
  assert.equal(parsed.points.length, 1);
  assert.equal(parsed.points[0].speedMetersPerSecond, 10);
});

test('rechaza coordenadas fuera de rango', () => {
  const batch = validBatch();
  batch.points[0].latitude = 120;
  assert.throws(() => parseMobilePositionBatch(batch), /fuera de rango/);
});

test('rechaza lotes mayores a cien posiciones', () => {
  const batch = validBatch();
  batch.points = Array.from({ length: 101 }, (_, index) => ({
    ...batch.points[0],
    id: `position-${index}`,
  }));
  assert.throws(() => parseMobilePositionBatch(batch), /entre 1 y 100/);
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { parseMobileEventBatch, parseVehicleAssignment } from './mobile-device.validation';

const now = 1_763_450_000_000;

function validBatch() {
  return {
    deviceId: 'a1b2c3d4e5f6a7b8',
    providerUnitId: 1084,
    plate: 'cjs-722',
    events: [{
      id: '6DF33C83-91EE-45E8-8608-78BE1C4C824B',
      type: 'STOP_END',
      timestamp: now - 60_000,
      latitude: -12.046374,
      longitude: -77.042793,
      recordedOffline: true,
      stopType: 'POSIBLE_ENTREGA',
      startTimestamp: now - 660_000,
      endTimestamp: now - 60_000,
      durationSeconds: 600,
      routeStopId: 501,
      placeName: 'Bodega',
    }],
  };
}

test('acepta un lote de eventos válido y normaliza placa e id', () => {
  const parsed = parseMobileEventBatch(validBatch(), now);
  assert.equal(parsed.plate, 'CJS-722');
  assert.equal(parsed.events[0].id, '6df33c83-91ee-45e8-8608-78be1c4c824b');
  assert.equal(parsed.events[0].stopType, 'POSIBLE_ENTREGA');
  assert.equal(parsed.events[0].recordedOffline, true);
  assert.equal(parsed.events[0].geofenceId, null);
});

test('rechaza STOP_END sin clasificación', () => {
  const batch = validBatch();
  delete (batch.events[0] as Record<string, unknown>).stopType;
  assert.throws(() => parseMobileEventBatch(batch, now), /stopType es obligatorio/);
});

test('rechaza la clasificación antigua ENTREGA', () => {
  const batch = validBatch();
  batch.events[0].stopType = 'ENTREGA';
  assert.throws(() => parseMobileEventBatch(batch, now), /stopType no es válido/);
});

test('rechaza tipos de evento desconocidos y ids que no son UUID', () => {
  const tipo = validBatch();
  tipo.events[0].type = 'OTRO';
  assert.throws(() => parseMobileEventBatch(tipo, now), /type no es válido/);
  const id = validBatch();
  id.events[0].id = 'abc';
  assert.throws(() => parseMobileEventBatch(id, now), /UUID/);
});

test('rechaza eventos con más de 31 días', () => {
  const batch = validBatch();
  batch.events[0].timestamp = now - 40 * 24 * 60 * 60 * 1_000;
  assert.throws(() => parseMobileEventBatch(batch, now), /fuera del intervalo/);
});

test('asignación acepta null para quitar el camión', () => {
  assert.deepEqual(parseVehicleAssignment({ vehicleId: null }), { vehicleId: null, assignedBy: null });
  assert.equal(parseVehicleAssignment({ vehicleId: 7, assignedBy: 'admin' }).vehicleId, 7);
  assert.throws(() => parseVehicleAssignment({ vehicleId: -1 }), /entero positivo/);
});

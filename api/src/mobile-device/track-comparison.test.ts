import assert from 'node:assert/strict';
import test from 'node:test';

import { compareTracks, downsample, phoneVehicleIdentity, trackKm, type TrackPoint } from './track-comparison';

const t0 = 1_763_450_000_000;
/** Punto desplazado ~metros hacia el norte desde Lima. */
function p(seconds: number, metersNorth: number, metersEast = 0): TrackPoint {
  return {
    latitude: -12.0 + metersNorth / 111_320,
    longitude: -77.0 + metersEast / (111_320 * Math.cos((12 * Math.PI) / 180)),
    time: t0 + seconds * 1000,
    speedKmh: null,
  };
}

test('identidad del celular es estable, en rango propio y con placa válida', () => {
  const a = phoneVehicleIdentity('547275ef59f455cc');
  assert.deepEqual(a, phoneVehicleIdentity('547275ef59f455cc'));
  assert.ok(a.providerUnitId >= 800_000_000 && a.providerUnitId < 900_000_000);
  assert.equal(a.plate, 'CEL-547275EF');
  assert.match(a.plate, /^[A-Z0-9 -]{1,15}$/);
  assert.notEqual(a.providerUnitId, phoneVehicleIdentity('a91f02bc77d3e410').providerUnitId);
});

test('trackKm suma el recorrido e ignora la deriva estando quieto', () => {
  const moving = Array.from({ length: 11 }, (_, i) => p(i * 10, i * 100)); // 1 km
  assert.equal(trackKm(moving), 1);
  const still = Array.from({ length: 50 }, (_, i) => p(i * 10, (i % 2) * 3)); // ruido de 3 m
  assert.equal(trackKm(still), 0);
});

test('trackKm descarta saltos imposibles', () => {
  assert.equal(trackKm([p(0, 0), p(10, 5_000), p(20, 0)]), 0);
});

test('celular dentro del camión: separación pequeña y 100% juntos', () => {
  const truck = Array.from({ length: 31 }, (_, i) => p(i * 30, i * 300));
  const phone = Array.from({ length: 91 }, (_, i) => p(i * 10, i * 100 + 20, 10));
  const result = compareTracks(phone, truck);
  assert.equal(result.togetherPct, 100);
  assert.ok(result.averageSeparationM !== null && result.averageSeparationM < 150);
  assert.equal(result.phoneKm, result.truckKm);
});

test('celular que se queda atrás: se detecta la separación', () => {
  const truck = Array.from({ length: 31 }, (_, i) => p(i * 30, i * 300));
  const phone = Array.from({ length: 91 }, (_, i) => p(i * 10, Math.min(i * 100, 2_000)));
  const result = compareTracks(phone, truck);
  assert.ok((result.togetherPct ?? 100) < 50);
  assert.ok((result.maxSeparationM ?? 0) > 5_000);
  assert.ok((result.currentSeparationM ?? 0) > 5_000);
});

test('sin lecturas del camión no hay comparación', () => {
  const result = compareTracks([p(0, 0), p(10, 100)], []);
  assert.equal(result.pairedSamples, 0);
  assert.equal(result.togetherPct, null);
  assert.equal(result.currentSeparationM, null);
});

test('downsample conserva primero y último', () => {
  const values = Array.from({ length: 1000 }, (_, i) => i);
  const reduced = downsample(values, 100);
  assert.equal(reduced.length, 100);
  assert.equal(reduced[0], 0);
  assert.equal(reduced.at(-1), 999);
});

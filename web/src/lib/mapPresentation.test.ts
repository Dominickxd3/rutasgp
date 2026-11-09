import assert from 'node:assert/strict';
import test from 'node:test';
import { historyCollections } from '../features/monitoreo/map/history.utils';
import type { HistoryResult } from '../features/historial/types/history.types';
import { isRouteActive } from '../layout/utils/navigation.utils';

function sample(): HistoryResult {
  const dates = [0, 30, 1800, 1830].map((seconds) =>
    new Date(Date.UTC(2026, 10, 3, 12, 0, seconds)).toISOString(),
  );
  return {
    vehicleId: 1,
    interval: { from: dates[0], to: dates[3] },
    pagination: { page: 1, pageSize: 4, total: 4, pages: 1 },
    observed: { first: dates[0], last: dates[3] },
    statistics: { points: 4, observedDistanceMeters: 0, gaps: 1, stops: 0 },
    points: dates.map((gpsDate, index) => ({
      id: index + 1,
      gpsDate,
      latitude: -12,
      longitude: -77 + index * 0.001,
      speed: null,
      engine: null,
      heading: null,
    })),
    gaps: [{ from: dates[1], to: dates[2], seconds: 1770 }],
    stops: [],
    precisionNotice: 'Datos de prueba',
  };
}

test('presentación: una interrupción conserva extremos sin inventar una conexión', () => {
  const result = sample();
  const before = structuredClone(result);
  const collections = historyCollections({ result, visiblePoints: 4 });
  assert.equal(collections.observed.features.length, 0);
  assert.equal(collections.gaps.features.length, 2);
  assert.equal(
    collections.markers.features.filter(
      (f) => f.properties?.kind === 'coverage-gap',
    ).length,
    2,
  );
  assert.deepEqual(
    result,
    before,
    'La presentación no modifica la evidencia original',
  );
  assert.deepEqual(
    collections.gaps.features.map((f) => {
      assert.equal(f.geometry.type, 'LineString');
      return f.geometry.type === 'LineString'
        ? f.geometry.coordinates.length
        : 0;
    }),
    [2, 2],
  );
});

test('presentación: mantiene separados OSRM ajustado y conexiones estimadas', () => {
  const result = sample();
  result.roadSegments = [
    {
      coordinates: [
        [-77, -12],
        [-76.999, -12],
      ],
      kind: 'matched',
      confidence: 0.9,
    },
    {
      coordinates: [
        [-76.999, -12],
        [-76.998, -12],
      ],
      kind: 'estimated',
      confidence: null,
      role: 'junction-estimate',
    },
  ];
  const collections = historyCollections({ result, visiblePoints: 4 });
  assert.equal(collections.observed.features.length, 1);
  assert.equal(collections.gaps.features.length, 1);
  assert.equal(
    collections.gaps.features[0].properties?.kind,
    'junction-estimate',
  );
  assert.equal(collections.gaps.features[0].properties?.confidence, null);
});

test('presentación: reproducción parcial no muestra una interrupción futura', () => {
  const result = sample();
  const collections = historyCollections({ result, visiblePoints: 2 });
  assert.equal(
    collections.markers.features.filter(
      (f) => f.properties?.kind === 'coverage-gap',
    ).length,
    0,
  );
  assert.equal(collections.gaps.features.length, 1);
  const geometry = collections.gaps.features[0].geometry;
  assert.equal(geometry.type, 'LineString');
  if (geometry.type === 'LineString') {
    assert.deepEqual(geometry.coordinates, [
      [-77, -12],
      [-76.999, -12],
    ]);
  }
});

test('navegación: admite rutas hijas sin activar opciones con prefijos parecidos', () => {
  assert.equal(isRouteActive('/monitoreo/flota/27', '/monitoreo/flota'), true);
  assert.equal(
    isRouteActive('/monitoreo/flota-extra', '/monitoreo/flota'),
    false,
  );
});

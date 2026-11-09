import assert from 'node:assert/strict';
import test from 'node:test';

import { detectGeofenceTransitions, resolveRouteMarkers } from './historyAnalysis';
import type { HistoryGeofenceEvent, HistoryResult } from '../features/historial/types/history.types';

test('las zonas de clientes no producen salidas o retornos de sede', () => {
  const result = { points: [0, 0.0005, 0.0006, 0.0007].map((longitude, index) => ({
    id: index, latitude: 0, longitude, speed: 0, engine: null, heading: null,
    gpsDate: new Date(index * 30_000).toISOString(),
  })) } as HistoryResult;
  assert.deepEqual(detectGeofenceTransitions(result, [{ id: 'client', name: 'Cliente', purpose: 'cliente',
    geometry: { shape: 'circle', latitude: 0, longitude: 0, radius: 30 } }]), []);
});

test('confirma una salida solo después de tres observaciones fuera', () => {
  const coordinates = [0, 0.0001, 0.0005, 0.0006, 0.0007];
  const result = {
    points: coordinates.map((longitude, index) => ({ id: index, latitude: 0, longitude, speed: 0, engine: null, heading: null, gpsDate: new Date(index * 30_000).toISOString() })),
  } as HistoryResult;
  const events = detectGeofenceTransitions(result, [{ id: 'sede', name: 'Sede', geometry: { shape: 'circle', latitude: 0, longitude: 0, radius: 30 } }]);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'salida');
});

test('ignora una fluctuación aislada en el borde', () => {
  const coordinates = [0, 0.0001, 0.0005, 0.0001, 0.0001];
  const result = { points: coordinates.map((longitude, index) => ({ id: index, latitude: 0, longitude, speed: 0, engine: null, heading: null, gpsDate: new Date(index * 30_000).toISOString() })) } as HistoryResult;
  const events = detectGeofenceTransitions(result, [{ id: 'sede', name: 'Sede', geometry: { shape: 'circle', latitude: 0, longitude: 0, radius: 30 } }]);
  assert.deepEqual(events, []);
});

test('no genera eventos de salida/entrada por movimientos entre dos polígonos de la misma sede', () => {
  // Polígono 1: [0, 0] a [0.001, 0.001]
  const poly1 = {
    id: 'poly1',
    name: 'Zona 1',
    sedeNombre: 'Grupo Pecuario S.A.C.',
    geometry: {
      shape: 'polygon' as const,
      vertices: [
        { latitude: 0, longitude: 0 },
        { latitude: 0.001, longitude: 0 },
        { latitude: 0.001, longitude: 0.001 },
        { latitude: 0, longitude: 0.001 },
      ],
    },
  };
  // Polígono 2: [0.0011, 0] a [0.002, 0.001] (adyacente)
  const poly2 = {
    id: 'poly2',
    name: 'Zona 2',
    sedeNombre: 'Grupo Pecuario S.A.C.',
    geometry: {
      shape: 'polygon' as const,
      vertices: [
        { latitude: 0.0011, longitude: 0 },
        { latitude: 0.002, longitude: 0 },
        { latitude: 0.002, longitude: 0.001 },
        { latitude: 0.0011, longitude: 0.001 },
      ],
    },
  };

  // El vehículo empieza en poly1, se mueve a poly2 (está en sede todo el tiempo)
  const points = [
    { latitude: 0.0005, longitude: 0.0005 }, // en poly1
    { latitude: 0.0008, longitude: 0.0005 }, // en poly1
    { latitude: 0.00105, longitude: 0.0005 }, // entre ambos (a 5 metros, dentro de tolerancia de 20m)
    { latitude: 0.0015, longitude: 0.0005 }, // en poly2
    { latitude: 0.0018, longitude: 0.0005 }, // en poly2
  ];

  const result = {
    points: points.map((p, index) => ({
      id: index,
      latitude: p.latitude,
      longitude: p.longitude,
      speed: 0,
      engine: null,
      heading: null,
      gpsDate: new Date(index * 30_000).toISOString(),
    })),
  } as HistoryResult;

  const events = detectGeofenceTransitions(result, [poly1, poly2]);
  assert.equal(events.length, 0, 'No debe generar eventos de salida ni entrada al moverse internamente en la sede');
});

test('Caso A: recorrido iniciado antes de la primera posición almacenada (Surco sin salida observada)', () => {
  // Vehículo transmite directamente desde Surco a las 10:00 sin salida de sede previa en el intervalo
  const points = [
    { id: 1, latitude: -12.135, longitude: -76.985, speed: 25, engine: 'Encendido', heading: 90, gpsDate: '2026-10-30T15:00:00Z' },
    { id: 2, latitude: -12.138, longitude: -76.982, speed: 30, engine: 'Encendido', heading: 90, gpsDate: '2026-10-30T15:01:00Z' },
  ];

  const markers = resolveRouteMarkers({
    points,
    stops: [],
    geofenceEvents: [], // No hay evento de salida de sede
  });

  // Debe marcar "Primera posición disponible" en Surco, NUNCA "Salida de sede"
  const startMarker = markers.find((m) => m.kind === 'start');
  assert.ok(startMarker, 'Debe existir un marcador tipo start');
  assert.equal(startMarker.label, 'Primera posición disponible');
  assert.equal(startMarker.latitude, -12.135);
  assert.equal(startMarker.longitude, -76.985);

  const departureMarker = markers.find((m) => m.kind === 'departure');
  assert.equal(departureMarker, undefined, 'No debe existir marcador de salida de sede si no fue observada');
});

test('Caso B: recorrido con salida confirmada de sede en Canto Bello', () => {
  // Vehículo sale de Canto Bello (-11.9845, -76.9972) a las 08:30:00
  const points = [
    { id: 10, latitude: -11.9845, longitude: -76.9972, speed: 10, engine: 'Encendido', heading: 180, gpsDate: '2026-10-30T13:30:00Z' },
    { id: 11, latitude: -11.9860, longitude: -76.9980, speed: 35, engine: 'Encendido', heading: 180, gpsDate: '2026-10-30T13:31:00Z' },
    { id: 12, latitude: -12.0100, longitude: -77.0100, speed: 40, engine: 'Encendido', heading: 180, gpsDate: '2026-10-30T13:45:00Z' },
  ];

  const geofenceEvents: HistoryGeofenceEvent[] = [
    {
      id: 1,
      sedeId: 1,
      tipoEvento: 'SALIDA',
      fechaGpsUtc: '2026-10-30T13:30:00Z',
      idPosicion: 10,
      sedeNombre: 'Grupo Pecuario S.A.C.',
      latitude: -11.9845,
      longitude: -76.9972,
    },
  ];

  const markers = resolveRouteMarkers({
    points,
    stops: [],
    geofenceEvents,
  });

  const departureMarker = markers.find((m) => m.kind === 'departure');
  assert.ok(departureMarker, 'Debe existir marcador departure');
  assert.equal(departureMarker.label, 'Salida de sede');
  assert.equal(departureMarker.latitude, -11.9845);
  assert.equal(departureMarker.longitude, -76.9972);

  // Al coincidir con la salida en el primer punto, no debe duplicarse como 'start' genérico
  const startMarker = markers.find((m) => m.kind === 'start');
  assert.equal(startMarker, undefined, 'No debe duplicar marcador genérico si ya hay salida confirmada');
});

test('Caso C: múltiples salidas y retornos en un mismo día', () => {
  const points = [
    { id: 1, latitude: -11.984, longitude: -76.997, speed: 0, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T12:00:00Z' },
    { id: 2, latitude: -12.050, longitude: -77.020, speed: 30, engine: 'Encendido', heading: 180, gpsDate: '2026-10-30T13:00:00Z' },
    { id: 3, latitude: -11.984, longitude: -76.997, speed: 0, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T15:00:00Z' },
    { id: 4, latitude: -12.080, longitude: -77.010, speed: 25, engine: 'Encendido', heading: 180, gpsDate: '2026-10-30T17:00:00Z' },
    { id: 5, latitude: -11.984, longitude: -76.997, speed: 0, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T19:00:00Z' },
  ];

  const geofenceEvents: HistoryGeofenceEvent[] = [
    { id: 101, sedeId: 1, tipoEvento: 'SALIDA', fechaGpsUtc: '2026-10-30T12:00:00Z', idPosicion: 1, sedeNombre: 'Grupo Pecuario S.A.C.', latitude: -11.984, longitude: -76.997 },
    { id: 102, sedeId: 1, tipoEvento: 'ENTRADA', fechaGpsUtc: '2026-10-30T15:00:00Z', idPosicion: 3, sedeNombre: 'Grupo Pecuario S.A.C.', latitude: -11.984, longitude: -76.997 },
    { id: 103, sedeId: 1, tipoEvento: 'SALIDA', fechaGpsUtc: '2026-10-30T16:30:00Z', idPosicion: 4, sedeNombre: 'Grupo Pecuario S.A.C.', latitude: -11.984, longitude: -76.997 },
    { id: 104, sedeId: 1, tipoEvento: 'ENTRADA', fechaGpsUtc: '2026-10-30T19:00:00Z', idPosicion: 5, sedeNombre: 'Grupo Pecuario S.A.C.', latitude: -11.984, longitude: -76.997 },
  ];

  const markers = resolveRouteMarkers({
    points,
    stops: [],
    geofenceEvents,
  });

  const departures = markers.filter((m) => m.kind === 'departure');
  const arrivals = markers.filter((m) => m.kind === 'arrival');

  assert.equal(departures.length, 2, 'Debe haber 2 salidas de sede registradas');
  assert.equal(arrivals.length, 2, 'Debe haber 2 retornos a sede registrados');
});

test('Caso D: posiciones fuera de orden cronológico se ordenan estrictamente', () => {
  // Puntos intencionalmente desordenados
  const points = [
    { id: 3, latitude: -12.03, longitude: -77.03, speed: 20, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T14:00:00Z' },
    { id: 1, latitude: -12.01, longitude: -77.01, speed: 20, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T12:00:00Z' },
    { id: 4, latitude: -12.04, longitude: -77.04, speed: 20, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T15:00:00Z' },
    { id: 2, latitude: -12.02, longitude: -77.02, speed: 20, engine: 'Encendido', heading: 0, gpsDate: '2026-10-30T13:00:00Z' },
  ];

  const markers = resolveRouteMarkers({
    points,
    stops: [],
    geofenceEvents: [],
  });

  // El marcador 'start' debe corresponder al punto con fecha más antigua (id: 1 a las 12:00)
  const startMarker = markers.find((m) => m.kind === 'start');
  assert.ok(startMarker);
  assert.equal(startMarker.latitude, -12.01);
  assert.equal(startMarker.longitude, -77.01);

  // El marcador 'end' debe corresponder al punto con fecha más reciente (id: 4 a las 15:00)
  const endMarker = markers.find((m) => m.kind === 'end');
  assert.ok(endMarker);
  assert.equal(endMarker.latitude, -12.04);
  assert.equal(endMarker.longitude, -77.04);
});



import assert from 'node:assert/strict';
import test from 'node:test';

import { TripsService, type PositionPoint } from './trips.service';

test('detectStops identifica una parada de más de 180 segundos en radio menor a 40 metros', () => {
  const service = new TripsService({ pool: Promise.resolve(null as any) } as any, {} as any);

  const baseDate = new Date('2026-10-30T18:00:00Z');
  const points: PositionPoint[] = [
    // Movimiento inicial
    { id: 1, latitude: -12.000, longitude: -77.000, speed: 30, engine: 'Encendido', heading: 0, gpsDate: new Date(baseDate.getTime()) },
    { id: 2, latitude: -12.010, longitude: -77.010, speed: 25, engine: 'Encendido', heading: 0, gpsDate: new Date(baseDate.getTime() + 60_000) },
    // Parada: 4 minutos estacionado en el mismo punto (velocidad 0)
    { id: 3, latitude: -12.015, longitude: -77.015, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 120_000) },
    { id: 4, latitude: -12.01501, longitude: -77.01501, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 240_000) },
    { id: 5, latitude: -12.01502, longitude: -77.01501, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 360_000) },
    // Reanuda marcha
    { id: 6, latitude: -12.025, longitude: -77.025, speed: 35, engine: 'Encendido', heading: 0, gpsDate: new Date(baseDate.getTime() + 420_000) },
  ];

  const stops = service.detectStops(points, 40, 180);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].durationSeconds, 240); // 360s - 120s = 240s
  assert.ok(stops[0].radiusMeters <= 40);
});

test('detectStops agrupa latidos periódicos de 5 min con motor detenido como una parada continua', () => {
  const service = new TripsService({ pool: Promise.resolve(null as any) } as any, {} as any);

  const baseDate = new Date('2026-10-30T18:30:00Z');
  const points: PositionPoint[] = [
    { id: 1, latitude: -12.09105, longitude: -77.03666, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime()) },
    { id: 2, latitude: -12.09105, longitude: -77.03666, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 300_000) }, // +5 min
    { id: 3, latitude: -12.09105, longitude: -77.03666, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 600_000) }, // +10 min
    { id: 4, latitude: -12.09105, longitude: -77.03666, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(baseDate.getTime() + 900_000) }, // +15 min
  ];

  const stops = service.detectStops(points, 40, 180);
  assert.equal(stops.length, 1);
  assert.equal(stops[0].durationSeconds, 900); // 15 minutos en el mismo lugar
});

test('detectStops no inventa una parada durante dos horas sin cobertura', () => {
  const service = new TripsService({ pool: Promise.resolve(null as any) } as any, {} as any);
  const points: PositionPoint[] = [
    { id: 1, latitude: -12.09, longitude: -77.03, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date('2026-10-30T10:00:00Z') },
    { id: 2, latitude: -12.09, longitude: -77.03, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date('2026-10-30T12:00:00Z') },
  ];
  assert.equal(service.detectStops(points, 40, 180).length, 0);
});

test('detectStops rechaza una lectura detenida aislada', () => {
  const service = new TripsService({ pool: Promise.resolve(null as any) } as any, {} as any);
  const points: PositionPoint[] = [
    { id: 1, latitude: -12, longitude: -77, speed: 25, engine: 'Encendido', heading: 0, gpsDate: new Date('2026-10-30T10:00:00Z') },
    { id: 2, latitude: -12.01, longitude: -77.01, speed: 0, engine: 'Encendido', heading: 0, gpsDate: new Date('2026-10-30T10:01:00Z') },
    { id: 3, latitude: -12.02, longitude: -77.02, speed: 30, engine: 'Encendido', heading: 0, gpsDate: new Date('2026-10-30T10:02:00Z') },
  ];
  assert.equal(service.detectStops(points, 40, 180).length, 0);
});

test('detectStops evalúa evidencia técnica y confianza para Machine Learning', () => {
  const service = new TripsService({ pool: Promise.resolve(null as any) } as any, {} as any);
  const base = new Date('2026-10-30T10:00:00Z');

  // Caso 1: Parada con lecturas continuas cada 30 segundos (Confianza Alta, PARADA_OBSERVADA)
  const continuousPoints: PositionPoint[] = Array.from({ length: 10 }, (_, i) => ({
    id: i + 1,
    latitude: -12.015,
    longitude: -77.015,
    speed: 0,
    engine: 'Detenido',
    heading: 0,
    gpsDate: new Date(base.getTime() + i * 30_000), // cada 30s
  }));

  const stopObs = service.detectStops(continuousPoints, 40, 180);
  assert.equal(stopObs.length, 1);
  assert.equal(stopObs[0].confidence, 'ALTA');
  assert.equal(stopObs[0].detectionType, 'OBSERVADA');
  assert.equal(stopObs[0].locationType, 'OTRA');
  assert.equal(stopObs[0].distinctCoordinates, 1);
  assert.equal(stopObs[0].hasRepeatedCoordinates, true);
  assert.equal(stopObs[0].distinctGpsTimestamps, 10);
  assert.equal(stopObs[0].maxGapSeconds, 30);
  assert.equal(stopObs[0].coverageRatioPct, 100);
  assert.equal(stopObs[0].engineState, 'Detenido');

  // Caso 2: Parada con intervalo prolongado de 5 min (Confianza Baja, PARADA_PROBABLE)
  const heartbeatPoints: PositionPoint[] = [
    { id: 1, latitude: -12.015, longitude: -77.015, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(base.getTime()) },
    { id: 2, latitude: -12.015, longitude: -77.015, speed: 0, engine: 'Detenido', heading: 0, gpsDate: new Date(base.getTime() + 301_000) },
  ];
  const stopProb = service.detectStops(heartbeatPoints, 40, 180);
  assert.equal(stopProb.length, 1);
  assert.equal(stopProb[0].confidence, 'BAJA');
  assert.equal(stopProb[0].detectionType, 'PROBABLE');
  assert.equal(stopProb[0].maxGapSeconds, 301);
});

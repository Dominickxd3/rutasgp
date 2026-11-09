import assert from 'node:assert/strict';
import test from 'node:test';

import { buildTripWindows, type GeofenceEventInput } from './trip-consolidation';

function event(
  id: number,
  tipo: 'SALIDA' | 'ENTRADA',
  minutos: number,
): GeofenceEventInput {
  return {
    id_evento: id,
    id_sede: 1,
    tipo_evento: tipo,
    fecha_gps_utc: new Date(Date.UTC(2026, 9, 31, 10, minutos, 0)),
    id_posicion: id * 10,
  };
}

test('buildTripWindows empareja SALIDA con la siguiente ENTRADA', () => {
  const windows = buildTripWindows([
    event(1, 'SALIDA', 0),
    event(2, 'ENTRADA', 30),
  ]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].endReason, 'ENTRADA');
  assert.equal(windows[0].entrada?.id_evento, 2);
  assert.equal(windows[0].endLimit?.toISOString(), '2026-10-31T10:30:00.000Z');
});

test('buildTripWindows ignora una ENTRADA sin SALIDA observada', () => {
  const windows = buildTripWindows([
    event(1, 'ENTRADA', 0),
    event(2, 'SALIDA', 30),
    event(3, 'ENTRADA', 60),
  ]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].salida.id_evento, 2);
  assert.equal(windows[0].entrada?.id_evento, 3);
});

test('buildTripWindows cierra el primer recorrido si aparece otra SALIDA sin retorno', () => {
  const windows = buildTripWindows([
    event(1, 'SALIDA', 0),
    event(2, 'SALIDA', 45),
  ]);

  assert.equal(windows.length, 2);
  assert.equal(windows[0].endReason, 'SIGUIENTE_SALIDA');
  assert.equal(windows[0].entrada, null);
  assert.equal(windows[0].endLimit?.toISOString(), '2026-10-31T10:45:00.000Z');
  assert.equal(windows[1].endReason, 'SIN_RETORNO');
  assert.equal(windows[1].salida.id_evento, 2);
});

test('buildTripWindows deja abierta la última SALIDA sin retorno', () => {
  const windows = buildTripWindows([event(1, 'SALIDA', 0)]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].endReason, 'SIN_RETORNO');
  assert.equal(windows[0].endLimit, null);
  assert.equal(windows[0].entrada, null);
});

test('buildTripWindows ordena eventos desordenados antes de emparejar', () => {
  const windows = buildTripWindows([
    event(2, 'ENTRADA', 30),
    event(1, 'SALIDA', 0),
  ]);

  assert.equal(windows.length, 1);
  assert.equal(windows[0].salida.id_evento, 1);
  assert.equal(windows[0].entrada?.id_evento, 2);
});

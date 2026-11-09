import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { buildGeofenceCollection, withGeofencePreview } from '../../monitoreo/map/geofence.layers';
import { DEFAULT_GRUPO_PECUARIO_GEOFENCES, loadGeofences, saveGeofences } from '../../../lib/geofenceStorage';
import { geofenceAppearance } from './geofence-appearance.utils';
import type { GeofenceRecord } from '../types/geofence.types';

const client: GeofenceRecord = { id: 'client-test', name: 'Cliente de prueba', purpose: 'cliente', color: '#8b5cf6',
  geometry: { shape: 'circle', latitude: -12, longitude: -77, radius: 50 } };

test('la previsualizacion conserva colores y nombres de clientes y sedes sin alterar coordenadas', () => {
  const sede = DEFAULT_GRUPO_PECUARIO_GEOFENCES[0];
  const records = [sede, client];
  const preview = withGeofencePreview(records.map(record => record.geometry), client.geometry,
    { shape: 'circle', latitude: -12.001, longitude: -77, radius: 50 });
  const features = buildGeofenceCollection(preview, records).features;
  assert.equal(features[0].properties?.color, '#2563eb');
  assert.equal(features[1].properties?.color, '#8b5cf6');
  assert.equal(features[1].properties?.name, 'Cliente de prueba');
  assert.equal(features[1].properties?.purpose, 'cliente');
  assert.deepEqual(client.geometry, { shape: 'circle', latitude: -12, longitude: -77, radius: 50 });
  assert.equal(geofenceAppearance({ ...client, color: 'invalid' }).color, '#8b5cf6');
});

test('el almacenamiento conserva el cliente y su color junto a las geocercas anteriores', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { localStorage: {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key),
  } } });
  try {
    saveGeofences([...DEFAULT_GRUPO_PECUARIO_GEOFENCES, client]);
    const restored = loadGeofences();
    assert.deepEqual(restored.find(record => record.id === client.id), client);
    assert.equal(geofenceAppearance(restored[0]).color, '#2563eb');
    assert.deepEqual(restored[0].geometry, DEFAULT_GRUPO_PECUARIO_GEOFENCES[0].geometry);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

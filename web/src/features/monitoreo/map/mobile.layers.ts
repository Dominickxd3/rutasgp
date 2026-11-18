import type * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import type { MobileLiveResult } from '../../celulares/services/mobile-devices.service';

/** Colores del contraste: camión en azul, celular en naranja. */
export const MOBILE_TRUCK_COLOR = '#2563eb';
export const MOBILE_PHONE_COLOR = '#f97316';

const TRAIL_SOURCE_ID = 'mobile-trails';
const POINT_SOURCE_ID = 'mobile-points';

type Collection = GeoJSON.FeatureCollection;

const STOP_SHORT: Record<string, string> = {
  POSIBLE_ENTREGA: 'Posible entrega',
  TRAFICO: 'Tráfico',
  NO_PROGRAMADA: 'No programada',
  BASE: 'Base',
};

/** Color de cada tipo de parada inferida por el celular. */
const STOP_COLOR: maplibregl.ExpressionSpecification = [
  'match', ['get', 'stopType'],
  'POSIBLE_ENTREGA', '#16a34a',
  'TRAFICO', '#94a3b8',
  'NO_PROGRAMADA', '#dc2626',
  'BASE', '#2563eb',
  '#64748b',
];

/** Tramos estimados (no confirmados sobre la vía) se dibujan más tenues. */
const QUALITY_OPACITY: maplibregl.ExpressionSpecification = [
  'match', ['get', 'quality'], 'matched', 0.95, 'raw', 0.6, 0.45,
];

function collections(data: MobileLiveResult | null): { trails: Collection; points: Collection } {
  const trails: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  // Ajustado a calles si ya está calculado; si no, la línea de lecturas GPS.
  const pushTrack = (track: MobileLiveResult['devices'][number]['phone'], kind: 'truck' | 'phone') => {
    if (!track) return;
    if (track.road && track.road.length > 0) {
      for (const part of track.road) {
        if (part.coordinates.length < 2) continue;
        trails.push({
          type: 'Feature',
          properties: { kind, quality: part.kind },
          geometry: { type: 'LineString', coordinates: part.coordinates },
        });
      }
    } else if (track.trail.length >= 2) {
      trails.push({
        type: 'Feature',
        properties: { kind, quality: 'raw' },
        geometry: { type: 'LineString', coordinates: track.trail.map(([lng, lat]) => [lng, lat]) },
      });
    }
  };
  for (const device of data?.devices ?? []) {
    const label = device.phone?.plate ?? device.deviceId.slice(0, 8);
    pushTrack(device.truck, 'truck');
    pushTrack(device.phone, 'phone');
    for (const stop of device.stopList ?? []) {
      const minutes = stop.durationSeconds === null ? '' : ` · ${Math.round(stop.durationSeconds / 60)} min`;
      points.push({
        type: 'Feature',
        properties: { kind: 'stop', stopType: stop.type, label: `${STOP_SHORT[stop.type] ?? stop.type}${minutes}` },
        geometry: { type: 'Point', coordinates: [stop.longitude, stop.latitude] },
      });
    }
    if (device.phone?.last) {
      points.push({
        type: 'Feature',
        properties: { kind: 'phone', label: `📱 ${label}${device.truck ? ` · ${device.truck.plate}` : ''}` },
        geometry: { type: 'Point', coordinates: [device.phone.last.longitude, device.phone.last.latitude] },
      });
    }
  }
  return {
    trails: { type: 'FeatureCollection', features: trails },
    points: { type: 'FeatureCollection', features: points },
  };
}

/** Capas del recorrido de los celulares y de su camión (debajo de los íconos de flota). */
export function addMobileLayers(map: MapLibreMap): void {
  const empty = collections(null);
  map.addSource(TRAIL_SOURCE_ID, { type: 'geojson', data: empty.trails });
  map.addSource(POINT_SOURCE_ID, { type: 'geojson', data: empty.points });
  map.addLayer({
    id: 'mobile-truck-trail',
    type: 'line',
    source: TRAIL_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'truck'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MOBILE_TRUCK_COLOR, 'line-width': 6, 'line-opacity': QUALITY_OPACITY },
  });
  map.addLayer({
    id: 'mobile-phone-trail',
    type: 'line',
    source: TRAIL_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'phone'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MOBILE_PHONE_COLOR, 'line-width': 3, 'line-opacity': QUALITY_OPACITY },
  });
  map.addLayer({
    id: 'mobile-stop-point',
    type: 'circle',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'stop'],
    paint: {
      'circle-radius': 6,
      'circle-color': STOP_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  });
  map.addLayer({
    id: 'mobile-stop-label',
    type: 'symbol',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'stop'],
    minzoom: 14,
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 10,
      'text-offset': [0, 1.2],
      'text-anchor': 'top',
    },
    paint: { 'text-color': '#334155', 'text-halo-color': '#ffffff', 'text-halo-width': 1.4 },
  });
  map.addLayer({
    id: 'mobile-phone-point',
    type: 'circle',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'phone'],
    paint: {
      'circle-radius': 8,
      'circle-color': MOBILE_PHONE_COLOR,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'mobile-phone-label',
    type: 'symbol',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'phone'],
    layout: {
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-offset': [0, 1.5],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#9a3412', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
}

export function setMobileSources(map: MapLibreMap, data: MobileLiveResult | null): void {
  const { trails, points } = collections(data);
  (map.getSource(TRAIL_SOURCE_ID) as GeoJSONSource | undefined)?.setData(trails);
  (map.getSource(POINT_SOURCE_ID) as GeoJSONSource | undefined)?.setData(points);
}

export function hasMobileLayers(map: MapLibreMap): boolean {
  return Boolean(map.getSource(TRAIL_SOURCE_ID));
}

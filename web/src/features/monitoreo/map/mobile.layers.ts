import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

import type { MobileLiveResult } from '../../celulares/services/mobile-devices.service';

/** Colores del contraste: camión en azul, celular en naranja. */
export const MOBILE_TRUCK_COLOR = '#2563eb';
export const MOBILE_PHONE_COLOR = '#f97316';

const TRAIL_SOURCE_ID = 'mobile-trails';
const POINT_SOURCE_ID = 'mobile-points';

type Collection = GeoJSON.FeatureCollection;

function collections(data: MobileLiveResult | null): { trails: Collection; points: Collection } {
  const trails: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  for (const device of data?.devices ?? []) {
    const label = device.phone?.plate ?? device.deviceId.slice(0, 8);
    if (device.truck && device.truck.trail.length >= 2) {
      trails.push({
        type: 'Feature',
        properties: { kind: 'truck', deviceId: device.deviceId },
        geometry: { type: 'LineString', coordinates: device.truck.trail.map(([lng, lat]) => [lng, lat]) },
      });
    }
    if (device.phone && device.phone.trail.length >= 2) {
      trails.push({
        type: 'Feature',
        properties: { kind: 'phone', deviceId: device.deviceId },
        geometry: { type: 'LineString', coordinates: device.phone.trail.map(([lng, lat]) => [lng, lat]) },
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
    paint: { 'line-color': MOBILE_TRUCK_COLOR, 'line-width': 5, 'line-opacity': 0.75 },
  });
  map.addLayer({
    id: 'mobile-phone-trail',
    type: 'line',
    source: TRAIL_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'phone'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': MOBILE_PHONE_COLOR, 'line-width': 3, 'line-opacity': 0.95, 'line-dasharray': [2, 1.2] },
  });
  map.addLayer({
    id: 'mobile-phone-point',
    type: 'circle',
    source: POINT_SOURCE_ID,
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

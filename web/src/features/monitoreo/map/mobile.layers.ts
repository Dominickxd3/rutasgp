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

/**
 * Nombre que se muestra junto al ícono del celular: la placa del camión
 * asignado; si no tiene, el nombre del dispositivo (marca y modelo).
 */
export function phoneLabel(device: MobileLiveResult['devices'][number]): string {
  if (device.assignedPlate) return device.assignedPlate;
  const model = device.model?.replace(/\s*\(Android[^)]*\)\s*$/i, '').trim();
  return model || device.phone?.plate || device.deviceId.slice(0, 8);
}

const PHONE_ICON_ID = 'mobile-phone-icon';

/** Ícono de celular (contorno, como el de la referencia) dibujado en un canvas. */
function phoneIconImage(): ImageData | null {
  // Alta resolución (x4) para que se vea nítido al agrandarse con el zoom
  const scale = 4;
  const w = 26 * scale;
  const h = 40 * scale;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const line = 2.6 * scale;
  const pad = line;
  const radius = 5 * scale;
  ctx.lineWidth = line;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#111827';
  ctx.fillStyle = '#ffffff';
  // Cuerpo
  ctx.beginPath();
  ctx.roundRect(pad, pad, w - pad * 2, h - pad * 2, radius);
  ctx.fill();
  ctx.stroke();
  // Pantalla en naranja suave
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(pad + line / 2, pad + 7 * scale, w - pad * 2 - line, h - pad * 2 - 14 * scale);
  ctx.beginPath();
  ctx.moveTo(pad, pad + 7 * scale);
  ctx.lineTo(w - pad, pad + 7 * scale);
  ctx.moveTo(pad, h - pad - 7 * scale);
  ctx.lineTo(w - pad, h - pad - 7 * scale);
  // Auricular
  ctx.moveTo(w / 2 - 4 * scale, pad + 3.5 * scale);
  ctx.lineTo(w / 2 + 4 * scale, pad + 3.5 * scale);
  ctx.stroke();
  // Botón
  ctx.beginPath();
  ctx.arc(w / 2, h - pad - 3.5 * scale, 1.6 * scale, 0, Math.PI * 2);
  ctx.stroke();
  return ctx.getImageData(0, 0, w, h);
}

function collections(data: MobileLiveResult | null): { trails: Collection; points: Collection } {
  const trails: GeoJSON.Feature[] = [];
  const points: GeoJSON.Feature[] = [];
  // Solo el recorrido ajustado a calles (o depurado por el servidor). Nunca las
  // lecturas crudas: con el vehículo quieto el GPS "tiembla" y dibujaría garabatos.
  const pushTrack = (track: MobileLiveResult['devices'][number]['phone'], kind: 'truck' | 'phone') => {
    for (const part of track?.road ?? []) {
      if (part.coordinates.length < 2) continue;
      trails.push({
        type: 'Feature',
        properties: { kind, quality: part.kind },
        geometry: { type: 'LineString', coordinates: part.coordinates },
      });
    }
  };
  for (const device of data?.devices ?? []) {
    const label = phoneLabel(device);
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
        properties: { kind: 'phone', label },
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
  const icon = phoneIconImage();
  if (icon && !map.hasImage(PHONE_ICON_ID)) map.addImage(PHONE_ICON_ID, icon, { pixelRatio: 4 });
  // Ícono de celular con su nombre (o la placa del camión asignado) debajo
  map.addLayer({
    id: 'mobile-phone-point',
    type: 'symbol',
    source: POINT_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'phone'],
    layout: {
      'icon-image': PHONE_ICON_ID,
      // Se adapta a la vista: pequeño al ver la ciudad, más grande al acercarse
      'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.6, 13, 0.85, 16, 1.1, 18, 1.4],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'text-field': ['get', 'label'],
      'text-font': ['Noto Sans Bold'],
      'text-size': 12,
      'text-anchor': 'top',
      'text-offset': [0, 0.3],
      'text-allow-overlap': true,
    },
    paint: { 'text-color': '#111827', 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
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

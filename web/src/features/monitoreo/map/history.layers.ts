import { historyCollections } from './history.utils';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import * as maplibregl from 'maplibre-gl';
import { escapeHtml } from '../../../lib/format';
import type { HistoryVisualization } from '../../historial/types/history.types';
import {
  HISTORY_GAP_SOURCE_ID,
  HISTORY_MARKER_SOURCE_ID,
  HISTORY_OBSERVED_SOURCE_ID,
} from './map.config';
const gapPopups = new WeakMap<MapLibreMap, maplibregl.Popup>();
export function addHistoryLayers(map: MapLibreMap): void {
  const collections = historyCollections(null);
  map.addSource(HISTORY_OBSERVED_SOURCE_ID, {
    type: 'geojson',
    data: collections.observed,
  });
  map.addSource(HISTORY_GAP_SOURCE_ID, {
    type: 'geojson',
    data: collections.gaps,
  });
  map.addSource(HISTORY_MARKER_SOURCE_ID, {
    type: 'geojson',
    data: collections.markers,
  });
  map.addLayer({
    id: 'history-observed-line',
    type: 'line',
    source: HISTORY_OBSERVED_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#2563eb', 'line-width': 5, 'line-opacity': 0.95 },
  });
  map.addLayer({
    id: 'history-gap-line',
    type: 'line',
    source: HISTORY_GAP_SOURCE_ID,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    filter: ['!=', ['get', 'kind'], 'coverage-gap'],
    paint: {
      'line-color': [
        'match',
        ['get', 'kind'],
        'departure-estimate',
        '#64748b',
        'junction-estimate',
        '#64748b',
        'estimated',
        '#2563eb',
        'unmatched',
        '#2563eb',
        '#f97316',
      ],
      'line-width': 4,
      'line-dasharray': [1.5, 1.5],
      'line-opacity': 0.85,
    },
  });
  map.addLayer({
    id: 'history-coverage-gap-line',
    type: 'line',
    source: HISTORY_GAP_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'coverage-gap'],
    layout: { visibility: 'none' },
    paint: {
      'line-color': '#64748b',
      'line-width': 1.5,
      'line-dasharray': [3, 3],
      'line-opacity': 0.65,
    },
  });
  map.addLayer({
    id: 'history-gap-endpoints',
    type: 'circle',
    source: HISTORY_MARKER_SOURCE_ID,
    filter: ['==', ['get', 'kind'], 'coverage-gap'],
    paint: {
      'circle-radius': 4,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#64748b',
      'circle-stroke-width': 1.5,
    },
  });
  const selectGap = (event: maplibregl.MapLayerMouseEvent) => {
    const p = event.features?.[0]?.properties;
    if (!p) return;
    gapPopups.get(map)?.remove();
    const popup = new maplibregl.Popup({ maxWidth: '300px' })
      .setLngLat(event.lngLat)
      .setHTML(
        `<strong>Interrupción GPS · conexión estimada</strong><p>${escapeHtml(String(p.from))}<br>${escapeHtml(String(p.to))}</p>` +
          `<p>Duración: ${Math.round(Number(p.seconds) / 60)} min · Distancia recta: ${(Number(p.distance) / 1000).toFixed(2)} km</p>` +
          `<p>Desde: ${Number(p.fromLat).toFixed(6)}, ${Number(p.fromLng).toFixed(6)}<br>Hasta: ${Number(p.toLat).toFixed(6)}, ${Number(p.toLng).toFixed(6)}</p>` +
          '<small>Trayectoria desconocida entre ambas observaciones.</small>',
      )
      .addTo(map);
    gapPopups.set(map, popup);
  };
  map.on('click', 'history-gap-endpoints', selectGap);
  map.on('click', 'history-coverage-gap-line', selectGap);
  map.addLayer({
    id: 'history-markers',
    type: 'circle',
    source: HISTORY_MARKER_SOURCE_ID,
    filter: ['!=', ['get', 'kind'], 'coverage-gap'],
    paint: {
      'circle-radius': [
        'match',
        ['get', 'kind'],
        'departure',
        10,
        'arrival',
        10,
        'stop',
        6,
        8,
      ],
      'circle-color': [
        'match',
        ['get', 'kind'],
        'departure',
        '#059669', // Salida de sede confirmada: Verde esmeralda
        'arrival',
        '#2563eb', // Retorno a sede confirmado: Azul corporativo
        'start',
        '#475569', // Primera posición disponible: Gris pizarra
        'end',
        '#dc2626', // Última posición disponible: Rojo
        '#f59e0b', // Paradas observadas: Ámbar / Naranja dorado
      ],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2.5,
    },
  });
  map.addLayer({
    id: 'history-marker-labels',
    type: 'symbol',
    source: HISTORY_MARKER_SOURCE_ID,
    filter: ['!=', ['get', 'kind'], 'coverage-gap'],
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 11,
      'text-offset': [0, 1.4],
      'text-anchor': 'top',
      'text-allow-overlap': true,
    },
    paint: {
      'text-color': '#0f172a',
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  });
}
export function setHistorySources(
  map: MapLibreMap,
  history: HistoryVisualization | null,
): void {
  gapPopups.get(map)?.remove();
  gapPopups.delete(map);
  const collections = historyCollections(history);
  (
    map.getSource(HISTORY_OBSERVED_SOURCE_ID) as GeoJSONSource | undefined
  )?.setData(collections.observed);
  (map.getSource(HISTORY_GAP_SOURCE_ID) as GeoJSONSource | undefined)?.setData(
    collections.gaps,
  );
  (
    map.getSource(HISTORY_MARKER_SOURCE_ID) as GeoJSONSource | undefined
  )?.setData(collections.markers);
}

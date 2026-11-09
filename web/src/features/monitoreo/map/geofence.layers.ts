import type { GeofenceHandleKind } from './map.types';
import type { Feature, FeatureCollection, LineString, Polygon } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import { geofencePolygon, polygonFeature, type LatLng } from '../../../lib/geo';
import type { Geofence, GeofenceRecord } from '../../sede/types/geofence.types';
import { geofenceAppearance } from '../../sede/utils/geofence-appearance.utils';
import {
  DRAFT_FILL_LAYER_ID,
  DRAFT_LINE_LAYER_ID,
  DRAFT_SOURCE_ID,
  GEOFENCE_FILL_LAYER_ID,
  GEOFENCE_LINE_LAYER_ID,
  GEOFENCE_SOURCE_ID,
} from './map.config';
export function toCoordinate(point: LatLng): [number, number] {
  return [point.longitude, point.latitude];
}
export function buildGeofenceCollection(
  geofences: Geofence[],
  records: GeofenceRecord[] = [],
): FeatureCollection<Polygon> {
  return {
    type: 'FeatureCollection',
    features: geofences.map((geofence, index) => {
      const feature =
        geofence.shape === 'circle'
          ? geofencePolygon(
              {
                latitude: geofence.latitude,
                longitude: geofence.longitude,
              },
              geofence.radius,
            )
          : polygonFeature(geofence.vertices);

      const record = records[index];
      feature.properties = { ...geofenceAppearance(record),
        id: record?.id ?? index, name: record?.name ?? 'Geocerca', sedeNombre: record?.sedeNombre ?? '' };
      return feature;
    }),
  };
}
export function buildDraftCollection(
  vertices: LatLng[],
  cursor: LatLng | null,
): FeatureCollection<Polygon | LineString> {
  const features: Array<Feature<Polygon | LineString>> = [];
  const lineCoordinates = vertices.map(toCoordinate);
  if (cursor) {
    lineCoordinates.push(toCoordinate(cursor));
  }
  if (lineCoordinates.length >= 2) {
    features.push({
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: lineCoordinates,
      },
    });
  }
  if (vertices.length >= 3) {
    features.push(polygonFeature(vertices));
  }
  return {
    type: 'FeatureCollection',
    features,
  };
}
export function setGeofenceSource(
  map: MapLibreMap,
  geofences: Geofence[],
  records?: GeofenceRecord[],
): void {
  const source = map.getSource(GEOFENCE_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildGeofenceCollection(geofences, records));
}
export function withGeofencePreview(
  geofences: Geofence[],
  current: Geofence,
  preview: Geofence,
): Geofence[] {
  return geofences.map((item) => (item === current ? preview : item));
}
export function setDraftSource(
  map: MapLibreMap,
  vertices: LatLng[],
  cursor: LatLng | null,
): void {
  const source = map.getSource(DRAFT_SOURCE_ID) as GeoJSONSource | undefined;
  source?.setData(buildDraftCollection(vertices, cursor));
}
export function addGeofenceLayers(map: MapLibreMap): void {
  map.addSource(GEOFENCE_SOURCE_ID, {
    type: 'geojson',
    data: buildGeofenceCollection([]),
  });
  map.addLayer({
    id: GEOFENCE_FILL_LAYER_ID,
    type: 'fill',
    source: GEOFENCE_SOURCE_ID,
    paint: {
      'fill-color': ['coalesce', ['get', 'color'], '#2563eb'],
      'fill-opacity': 0.12,
    },
  });
  map.addLayer({
    id: GEOFENCE_LINE_LAYER_ID,
    type: 'line',
    source: GEOFENCE_SOURCE_ID,
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#2563eb'],
      'line-width': 2.5,
      'line-opacity': 0.9,
      'line-dasharray': [2, 1.5],
    },
  });
}
export function addDraftLayers(map: MapLibreMap): void {
  map.addSource(DRAFT_SOURCE_ID, {
    type: 'geojson',
    data: buildDraftCollection([], null),
  });
  map.addLayer({
    id: DRAFT_FILL_LAYER_ID,
    type: 'fill',
    source: DRAFT_SOURCE_ID,
    paint: {
      'fill-color': '#f59e0b',
      'fill-opacity': 0.1,
    },
  });
  map.addLayer({
    id: DRAFT_LINE_LAYER_ID,
    type: 'line',
    source: DRAFT_SOURCE_ID,
    paint: {
      'line-color': '#f59e0b',
      'line-width': 2.2,
      'line-opacity': 0.95,
    },
  });
}
export function createGeofenceHandle(
  kind: GeofenceHandleKind,
  label: string,
): HTMLDivElement {
  const element = document.createElement('div');
  element.className = `geofence-handle geofence-handle--${kind}`;
  element.setAttribute('role', 'button');
  element.setAttribute('aria-label', label);
  element.title = label;
  element.innerHTML = '<span class="geofence-handle__inner"></span>';
  return element;
}

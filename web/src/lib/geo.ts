import type { Feature, Polygon } from 'geojson';

export interface LatLng {
  latitude: number;
  longitude: number;
}

export const MIN_GEOFENCE_RADIUS = 50;
export const MAX_GEOFENCE_RADIUS = 20_000;
export const DEFAULT_GEOFENCE_RADIUS = 300;
export const MIN_POLYGON_VERTICES = 3;

const EARTH_RADIUS_M = 6_371_008.8;
const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

function toRadians(value: number): number {
  return value * DEG_TO_RAD;
}

/** Distancia ortodrómica en metros entre dos coordenadas. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = toRadians(b.longitude - a.longitude);
  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Punto de destino a partir de un centro, un radio y un rumbo. */
export function destinationPoint(
  center: LatLng,
  radiusMeters: number,
  bearingDegrees: number,
): LatLng {
  const angular = radiusMeters / EARTH_RADIUS_M;
  const bearing = toRadians(bearingDegrees);
  const lat1 = toRadians(center.latitude);
  const lng1 = toRadians(center.longitude);

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angular) +
      Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
  );

  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
      Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    latitude: lat2 * RAD_TO_DEG,
    longitude: lng2 * RAD_TO_DEG,
  };
}

/** Polígono cerrado que aproxima una geocerca circular. */
export function geofencePolygon(
  center: LatLng,
  radiusMeters: number,
  steps = 96,
): Feature<Polygon> {
  const coordinates: Array<[number, number]> = [];

  for (let index = 0; index < steps; index += 1) {
    const point = destinationPoint(
      center,
      radiusMeters,
      (index * 360) / steps,
    );

    coordinates.push([point.longitude, point.latitude]);
  }

  coordinates.push(coordinates[0]);

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

export function clampGeofenceRadius(radius: number): number {
  return Math.min(
    MAX_GEOFENCE_RADIUS,
    Math.max(MIN_GEOFENCE_RADIUS, radius),
  );
}

/** Polígono cerrado a partir de sus vértices. */
export function polygonFeature(vertices: LatLng[]): Feature<Polygon> {
  const coordinates: Array<[number, number]> = vertices.map((vertex) => [
    vertex.longitude,
    vertex.latitude,
  ]);

  if (coordinates.length > 0) {
    coordinates.push([...coordinates[0]]);
  }

  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [coordinates],
    },
  };
}

/** Comprueba si un punto está dentro de un polígono (ray casting). */
export function polygonContains(
  point: LatLng,
  vertices: LatLng[],
): boolean {
  if (vertices.length < MIN_POLYGON_VERTICES) {
    return false;
  }

  let inside = false;

  for (
    let current = 0, previous = vertices.length - 1;
    current < vertices.length;
    previous = current, current += 1
  ) {
    const a = vertices[current];
    const b = vertices[previous];
    const crossesLatitude =
      a.latitude > point.latitude !== b.latitude > point.latitude;

    if (!crossesLatitude) {
      continue;
    }

    const longitudeAtLatitude =
      ((b.longitude - a.longitude) * (point.latitude - a.latitude)) /
        (b.latitude - a.latitude) +
      a.longitude;

    if (point.longitude < longitudeAtLatitude) {
      inside = !inside;
    }
  }

  return inside;
}

/** Área aproximada del polígono en metros cuadrados. */
export function polygonAreaMeters(vertices: LatLng[]): number {
  if (vertices.length < MIN_POLYGON_VERTICES) {
    return 0;
  }

  const meanLatitude =
    vertices.reduce((sum, vertex) => sum + vertex.latitude, 0) /
    vertices.length;
  const longitudeScale = Math.cos(toRadians(meanLatitude));

  const projected = vertices.map((vertex) => ({
    x: toRadians(vertex.longitude) * EARTH_RADIUS_M * longitudeScale,
    y: toRadians(vertex.latitude) * EARTH_RADIUS_M,
  }));

  let area = 0;

  for (let index = 0; index < projected.length; index += 1) {
    const current = projected[index];
    const next = projected[(index + 1) % projected.length];

    area += current.x * next.y - next.x * current.y;
  }

  return Math.abs(area) / 2;
}

/** Centro geográfico simple de un conjunto de puntos. */
export function averagePoint(points: LatLng[]): LatLng | null {
  if (points.length === 0) {
    return null;
  }

  return {
    latitude:
      points.reduce((sum, point) => sum + point.latitude, 0) /
      points.length,
    longitude:
      points.reduce((sum, point) => sum + point.longitude, 0) /
      points.length,
  };
}

/** Distancia mínima en metros desde un punto a un segmento de línea. */
export function distanceToSegmentMeters(
  point: LatLng,
  a: LatLng,
  b: LatLng,
): number {
  const latMid = (toRadians(a.latitude) + toRadians(b.latitude)) / 2;
  const mPerLat = 111132.954;
  const mPerLon = 111412.84 * Math.cos(latMid);

  const px = (point.longitude - a.longitude) * mPerLon;
  const py = (point.latitude - a.latitude) * mPerLat;
  const bx = (b.longitude - a.longitude) * mPerLon;
  const by = (b.latitude - a.latitude) * mPerLat;

  const abLenSq = bx * bx + by * by;
  if (abLenSq === 0) return Math.hypot(px, py);

  const t = Math.max(0, Math.min(1, (px * bx + py * by) / abLenSq));
  const projX = t * bx;
  const projY = t * by;

  return Math.hypot(px - projX, py - projY);
}

/** Distancia en metros desde un punto a los bordes de un polígono. */
export function distanceToPolygonMeters(
  point: LatLng,
  vertices: LatLng[],
): number {
  if (polygonContains(point, vertices)) {
    return 0;
  }
  let minDistance = Infinity;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const d = distanceToSegmentMeters(point, vertices[j], vertices[i]);
    if (d < minDistance) minDistance = d;
  }
  return minDistance;
}


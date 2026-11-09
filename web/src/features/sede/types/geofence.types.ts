import type { LatLng } from '../../../lib/geo';

export type GeofenceShape = 'circle' | 'polygon';
export type GeofencePurpose = 'cliente' | 'sede' | 'zona';
export interface GeofenceAppearance { name: string; purpose: GeofencePurpose; color: string }

export interface CircleGeofence {
  shape: 'circle';
  latitude: number;
  longitude: number;
  radius: number;
}

export interface PolygonGeofence {
  shape: 'polygon';
  /** Vértices en orden; el último se conecta con el primero. */
  vertices: LatLng[];
}

export type Geofence = CircleGeofence | PolygonGeofence;

export interface GeofenceRecord {
  id: string;
  name: string;
  geometry: Geofence;
  sedeNombre?: string;
  purpose?: GeofencePurpose;
  color?: string;
}


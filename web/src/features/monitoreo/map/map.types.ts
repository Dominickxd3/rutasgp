import type { MutableRefObject } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { LatLng } from '../../../lib/geo';
import type { FleetUnit } from '../../flota/types/fleet.types';
import type { Geofence, GeofenceShape, GeofenceRecord } from '../../sede/types/geofence.types';
import type { HistoryVisualization } from '../../historial/types/history.types';
export interface FleetMapHandle {
  focusUnit: (unit: FleetUnit) => void;
  fitAll: () => void;
  resize: () => void;
  panTo?: (lngLat: [number, number]) => void;
}
export interface FleetMapProps {
  units: FleetUnit[];
  onSelect?: (unit: FleetUnit) => void;
  geofences: Geofence[];
  geofenceRecords?: GeofenceRecord[];
  geofence: Geofence | null;
  draftVertices: LatLng[];
  placingShape: GeofenceShape | null;
  onPickPoint?: (point: LatLng) => void;
  onDraftVertexMove?: (index: number, point: LatLng) => void;
  onGeofenceChange?: (geofence: Geofence) => void;
  history: HistoryVisualization | null;
  showGpsGaps: boolean;
}
export type GeofenceHandleKind =
  | 'center'
  | 'radius'
  | 'vertex'
  | 'midpoint'
  | 'move'
  | 'draft';
export type VehicleKind = 'car' | 'truck';
export interface UnitFeatureProperties {
  idUnidad: string;
  placa: string;
  icon: string;
  moving: number;
}

export interface GeofenceMapRefs {
  mapRef: MutableRefObject<MapLibreMap | null>;
  geofencesRef: MutableRefObject<Geofence[]>;
  geofenceRecordsRef: MutableRefObject<GeofenceRecord[] | undefined>;
  geofenceRef: MutableRefObject<Geofence | null>;
  draftVerticesRef: MutableRefObject<LatLng[]>;
  draftCursorRef: MutableRefObject<LatLng | null>;
  onDraftVertexMoveRef: MutableRefObject<
    ((index: number, point: LatLng) => void) | undefined
  >;
  onGeofenceChangeRef: MutableRefObject<
    ((geofence: Geofence) => void) | undefined
  >;
}

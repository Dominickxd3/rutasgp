export interface HistoryVehicle {
  id: number;
  providerId: number;
  plate: string;
  active: boolean;
  firstPosition: string | null;
  lastPosition: string | null;
  positionCount: number;
}

export interface HistoryPoint {
  id: number;
  latitude: number;
  longitude: number;
  speed: number | null;
  engine: string | null;
  heading: number | null;
  gpsDate: string;
}

export interface HistoryGeofenceEvent {
  id: number;
  sedeId: number;
  sedeNombre: string;
  tipoEvento: 'SALIDA' | 'ENTRADA';
  fechaGpsUtc: string;
  idPosicion: number;
  latitude?: number;
  longitude?: number;
}

export interface HistoryStop {
  start: string;
  end: string;
  seconds: number;
  latitude: number;
  longitude: number;
  radiusMeters?: number;
  samples?: number;
  detectionType?: 'OBSERVADA' | 'PROBABLE';
  locationType?: 'SEDE' | 'CLIENTE' | 'OTRA' | 'DESCONOCIDA';
  confidence?: 'ALTA' | 'MEDIA' | 'BAJA';
  confidenceReason?: string;
  distinctCoordinates?: number;
  hasRepeatedCoordinates?: boolean;
  distinctGpsTimestamps?: number;
  maxGapSeconds?: number;
  coverageRatioPct?: number;
  engineState?: string;
  sedeNombre?: string | null;
}

export interface HistoryResult {
  vehicleId: number;
  interval: { from: string; to: string };
  pagination: { page: number; pageSize: number; total: number; pages: number };
  observed: { first: string | null; last: string | null };
  statistics: {
    points: number;
    observedDistanceMeters: number;
    gaps: number;
    stops: number;
  };
  gaps: Array<{
    from: string;
    to: string;
    seconds: number;
    coordinates?: [number, number][];
  }>;
  stops: HistoryStop[];
  roadSegments?: Array<{
    coordinates: [number, number][];
    kind: 'matched' | 'estimated';
    confidence: number | null;
    role?: 'junction-estimate';
  }>;
  departureEstimate?: {
    sedeNombre: string;
    coordinates: [number, number][];
    from: string;
    to: string;
  } | null;
  mapMatching?: {
    applied: boolean;
    provider: string;
    matchedSegments: number;
    estimatedSegments: number;
  };
  stopCriteria?: {
    minimumSeconds: number;
    radiusMeters: number;
    maximumSpeedKmh: number;
    maximumStationaryGapSeconds: number;
  };
  points: HistoryPoint[];
  geofenceEvents?: HistoryGeofenceEvent[];
  departureObserved?: boolean;
  departureNotice?: string | null;
  precisionNotice: string;
}

export interface HistoryVisualization {
  result: HistoryResult;
  visiblePoints: number;
}

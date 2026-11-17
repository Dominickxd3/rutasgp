export interface MobilePositionPoint {
  id: string;
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  speedMetersPerSecond: number | null;
  gpsTimestamp: number;
  recordedTimestamp: number;
  mock: boolean;
}

export interface MobilePositionBatch {
  deviceId: string;
  providerUnitId: number;
  plate: string;
  points: MobilePositionPoint[];
}

export interface MobilePositionBatchResult {
  processedIds: string[];
  inserted: number;
  duplicates: number;
  rejected: number;
}

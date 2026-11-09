import type { HistoryVisualization } from './history.types';
import type { GeofenceRecord } from '../../sede/types/geofence.types';

export interface HistoryPanelProps {
  onVisualization: (value: HistoryVisualization | null) => void;
  geofences: GeofenceRecord[];
  isTab?: boolean;
}

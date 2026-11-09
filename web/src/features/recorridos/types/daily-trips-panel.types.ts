import type { HistoryVisualization } from '../../historial/types/history.types';
import type { TripRecord } from './trip.types';

export interface DailyTripsPanelProps {
  onVisualization: (value: HistoryVisualization | null) => void;
  onActiveCountChange?: (count: number) => void;
  onTripSelected?: (trip: TripRecord | null) => void;
  selectedTrip?: TripRecord | null;
  isTab?: boolean;
  liveEnabled?: boolean;
}

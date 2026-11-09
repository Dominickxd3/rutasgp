import type { FleetSnapshot } from '../../features/flota/types/fleet.types';

export interface AppHeaderProps {
  snapshot: FleetSnapshot | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  onMenuClick?: () => void;
}

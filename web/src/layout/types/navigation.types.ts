export interface NavItem {
  key?: string;
  path: string;
  label: string;
  icon: string;
  badge?: number | string;
  onClick?: () => void;
}

export interface NavSection {
  key: string;
  label: string;
  icon: string;
  items: NavItem[];
  collapsible?: boolean;
}

export interface NavigationCounts {
  units: number;
  activeTrips: number;
  insideSede: number;
}

import type { ReactNode } from 'react';
import type { NavSection } from './navigation.types';

export interface AppSidebarProps {
  sections: NavSection[];
  warning?: string | null;
  collapsed: boolean;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
  className?: string;
  children: ReactNode;
}

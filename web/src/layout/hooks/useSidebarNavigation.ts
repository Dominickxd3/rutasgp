import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavSection } from '../types/navigation.types';
import { isRouteActive } from '../utils/navigation.utils';
/** Router and expansion state shared by the expanded menu and icon rail. */
export function useSidebarNavigation(
  sections: NavSection[],
  onNavigate?: () => void,
) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>(
    () => Object.fromEntries(sections.map((section) => [section.key, true])),
  );
  const activeSection = sections.find((section) =>
    section.items.some((item) => isRouteActive(pathname, item.path)),
  )?.key;
  useEffect(() => {
    if (!activeSection) return;
    setExpandedKeys((current) =>
      current[activeSection] ? current : { ...current, [activeSection]: true },
    );
  }, [activeSection]);
  const goTo = useCallback(
    (path: string) => {
      navigate(path);
      onNavigate?.();
    },
    [navigate, onNavigate],
  );
  return { pathname, activeSection, expandedKeys, setExpandedKeys, goTo };
}

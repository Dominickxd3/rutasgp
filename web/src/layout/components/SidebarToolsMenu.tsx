import { useEffect, useState } from 'react';
import { PanelMenu } from 'primereact/panelmenu';
import type { MenuItem } from 'primereact/menuitem';
import type { NavItem, NavSection } from '../types/navigation.types';
import { isRouteActive } from '../utils/navigation.utils';
type KeyedMenuItem = MenuItem & { key: string; items?: KeyedMenuItem[] };

interface Props {
  section: NavSection; pathname: string; collapsed: boolean;
  onExpandSidebar?: () => void;
  onSelect: (event: React.MouseEvent, item: NavItem) => void;
}
export function SidebarToolsMenu({ section, pathname, collapsed, onExpandSidebar, onSelect }: Props) {
  const active = section.items.some(item => isRouteActive(pathname, item.path));
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({ [section.key]: active });
  useEffect(() => {
    if (active) setExpandedKeys(current => ({ ...current, [section.key]: true }));
  }, [active, pathname, section.key]);
  const model: KeyedMenuItem[] = [{ key: section.key, label: section.label, icon: section.icon,
    command: () => { if (collapsed) onExpandSidebar?.(); },
    items: section.items.map(item => ({ key: item.key ?? item.path, label: item.label, icon: item.icon,
      command: event => onSelect(event.originalEvent as React.MouseEvent, item),
      template: () => <a href={item.path} className={`sidebar-nav__item sidebar-tools__link ${isRouteActive(pathname, item.path) ? 'is-active' : ''}`}
        aria-current={isRouteActive(pathname, item.path) ? 'page' : undefined}
        onClick={event => { event.stopPropagation(); onSelect(event, item); }}>
        <i className={`${item.icon} sidebar-nav__icon`} aria-hidden="true" />
        <span className="sidebar-nav__label">{item.label}</span>
        {item.badge !== undefined && <span className="sidebar-nav__badge">{item.badge}</span>}
      </a> })),
  }];
  return <PanelMenu model={model} expandedKeys={expandedKeys}
    onExpandedKeysChange={value => setExpandedKeys(collapsed ? { ...value, [section.key]: true } : value)}
    className={`sidebar-tools ${collapsed ? 'sidebar-tools--collapsed' : ''}`}
    aria-label={section.label} />;
}

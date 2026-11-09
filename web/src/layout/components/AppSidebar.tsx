import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { NavSection } from '../types/navigation.types';
import { isRouteActive } from '../utils/navigation.utils';
import { useUserProfile } from '../hooks/useUserProfile';
import { SidebarUserProfile } from './SidebarUserProfile';
import { UserProfileModal } from './UserProfileModal';
import { SidebarToolsMenu } from './SidebarToolsMenu';

interface AppSidebarProps {
  sections: NavSection[];
  warning?: string | null;
  collapsed: boolean;
  isRefreshing?: boolean;
  error?: string | null;
  panelOpen?: boolean;
  onTogglePanel?: () => void;
  onToggleCollapse?: () => void;
  onClose?: () => void;
  onNavigate?: () => void;
  className?: string;
}

export function AppSidebar({
  sections,
  warning,
  collapsed,
  isRefreshing: _isRefreshing,
  error: _error,
  panelOpen = true,
  onTogglePanel,
  onToggleCollapse,
  onClose,
  onNavigate,
  className,
}: AppSidebarProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const { profile, connectionTime, sessionStartTime, saveProfile, logout } =
    useUserProfile();
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const handleItemClick = (
    event: React.MouseEvent,
    path: string,
    onClick?: () => void,
  ) => {
    event.preventDefault();
    if (onClick) {
      onClick();
      onNavigate?.();
      return;
    }

    const isActive = isRouteActive(location.pathname, path);
    if (isActive) {
      // Si la opción ya está seleccionada, hacer clic oculta o muestra el panel de información
      onTogglePanel?.();
    } else {
      // Si cambiamos a otra opción, navegar y asegurar que el panel esté visible
      navigate(path);
      if (!panelOpen) {
        onTogglePanel?.();
      }
    }
    onNavigate?.();
  };

  return (
    <aside
      className={[
        'app-sidebar',
        collapsed ? 'is-collapsed' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label="Navegación principal de Logistics OS"
    >
      {/* Brand Header */}
      <div className="sidebar-brand">
        <button
          type="button"
          className="sidebar-brand__logo"
          onClick={onToggleCollapse}
          title={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
          aria-label={collapsed ? 'Expandir barra lateral' : 'Contraer barra lateral'}
        >
          GP
        </button>
        {!collapsed && (
          <div
            className="sidebar-brand__info"
            onClick={onToggleCollapse}
            style={{ cursor: onToggleCollapse ? 'pointer' : 'default' }}
            title={onToggleCollapse ? 'Contraer barra lateral' : undefined}
          >
            <h1 className="sidebar-brand__name">Grupo Pecuario</h1>
            <span className="sidebar-brand__tag">LOGISTICS OS</span>
          </div>
        )}
        {onClose && (
          <button
            type="button"
            className="sidebar-close-btn"
            aria-label="Cerrar menú"
            onClick={onClose}
          >
            <i className="pi pi-times" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Warning banner if any */}
      {warning && !collapsed && (
        <div className="sidebar-warning-banner" role="alert">
          <i className="pi pi-exclamation-triangle" aria-hidden="true" />
          <span>{warning}</span>
        </div>
      )}

      {/* Navigation List */}
      <nav className="sidebar-nav" aria-label="Módulos del sistema">
        {sections.map((section, sectionIdx) => {
          if (section.collapsible) return <SidebarToolsMenu key={section.key} section={section}
            pathname={location.pathname} collapsed={collapsed} onExpandSidebar={onToggleCollapse}
            onSelect={(event, item) => handleItemClick(event, item.path, item.onClick)} />;
          const showSectionTitle = !collapsed && sectionIdx > 0;
          return (
            <div key={section.key} className="sidebar-nav__group">
              {showSectionTitle && (
                <div className="sidebar-nav__section-title">
                  {section.label}
                </div>
              )}
              {section.items.map((item) => {
                const isActive =
                  !item.onClick && isRouteActive(location.pathname, item.path);

                const tooltip = collapsed
                  ? isActive
                    ? panelOpen
                      ? `Ocultar ${item.label}`
                      : `Mostrar ${item.label}`
                    : item.label
                  : undefined;

                return (
                  <a
                    key={item.key ?? item.path}
                    href={item.path}
                    className={[
                      'sidebar-nav__item',
                      isActive ? 'is-active' : '',
                      collapsed ? 'is-collapsed-item' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    title={tooltip}
                    aria-current={isActive ? 'page' : undefined}
                    onClick={(e) => handleItemClick(e, item.path, item.onClick)}
                  >
                    <i
                      className={`${item.icon} sidebar-nav__icon`}
                      aria-hidden="true"
                    />
                    {!collapsed && (
                      <span className="sidebar-nav__label">{item.label}</span>
                    )}
                    {!collapsed && item.badge !== undefined && (
                      <span className="sidebar-nav__badge">{item.badge}</span>
                    )}
                    {collapsed && item.badge !== undefined && (
                      <span className="sidebar-nav__collapsed-dot" />
                    )}
                  </a>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Sidebar Footer: User Profile Widget with Photo, Role & Connection Time */}
      <div className="sidebar-footer">
        <SidebarUserProfile
          profile={profile}
          connectionTime={connectionTime}
          collapsed={collapsed}
          onClick={() => setProfileModalOpen(true)}
        />
      </div>

      {/* User Profile & Configuration Modal (Photo, Email, Phone for Telegram, Logout) */}
      <UserProfileModal
        visible={profileModalOpen}
        onHide={() => setProfileModalOpen(false)}
        profile={profile}
        connectionTime={connectionTime}
        sessionStartTime={sessionStartTime}
        onSave={saveProfile}
        onLogout={logout}
      />
    </aside>
  );
}

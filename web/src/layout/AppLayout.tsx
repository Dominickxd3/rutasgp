import { useEffect, useMemo, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AppSidebar } from './components/AppSidebar';
import { KpisModal } from './components/KpisModal';
import { useAppState } from '../context/AppStateContext';
import { MonitoringMap } from '../features/monitoreo/components/MonitoringMap';
import { createNavigation } from './config/navigation.config';
import { useSidebarLayout } from './hooks/useSidebarLayout';
import { MobileNavigationBar } from './components/MobileNavigationBar';

export function AppLayout() {
  const location = useLocation();
  const {
    snapshot,
    units,
    error,
    isRefreshing,
    refresh,
    activeTripsCount,
    unitsInsideSede,
    setSelectedTrip,
    setHistory,
    setSelectedUnit,
    fitAll,
  } = useAppState();

  // Si el usuario cambia a "Monitoreo en vivo" (/monitoreo/flota), deselecciona la ruta previa y encuadra todos los camiones
  useEffect(() => {
    if (location.pathname.startsWith('/monitoreo/flota')) {
      setSelectedTrip(null);
      setHistory(null);
      setSelectedUnit(null);
      fitAll();
    }
  }, [location.pathname, setSelectedTrip, setHistory, setSelectedUnit, fitAll]);

  const { isDesktop, collapsed, setCollapsed, mobileOpen, setMobileOpen } =
    useSidebarLayout();

  const [panelOpen, setPanelOpen] = useState(true);
  const [kpisOpen, setKpisOpen] = useState(false);

  const sections = useMemo(
    () =>
      createNavigation(
        {
          units: units.length,
          activeTrips: activeTripsCount,
          insideSede: unitsInsideSede,
        },
        () => setKpisOpen(true),
      ),
    [units.length, activeTripsCount, unitsInsideSede],
  );

  return (
    <div className={`app-shell ${collapsed ? 'has-collapsed-sidebar' : ''}`}>
      {!isDesktop && <MobileNavigationBar panelOpen={panelOpen} onOpenMenu={() => setMobileOpen(true)}
        onTogglePanel={() => setPanelOpen(value => !value)} />}
      {/* Mobile scrim backdrop */}
      <button
        type="button"
        className={`app-sidebar-scrim ${mobileOpen ? 'is-visible' : ''}`}
        aria-label="Cerrar menú de navegación"
        tabIndex={-1}
        onClick={() => setMobileOpen(false)}
      />

      {/* Dark Sidebar Nav Rail */}
      <AppSidebar
        sections={sections}
        warning={units.length > 0 ? (snapshot?.warning ?? error) : null}
        collapsed={isDesktop ? collapsed : false}
        isRefreshing={isRefreshing}
        error={error}
        panelOpen={panelOpen}
        onTogglePanel={() => setPanelOpen((current) => !current)}
        className={
          isDesktop
            ? undefined
            : `app-sidebar--mobile ${mobileOpen ? 'is-open' : ''}`
        }
        onToggleCollapse={
          isDesktop ? () => setCollapsed((value) => !value) : undefined
        }
        onClose={isDesktop ? undefined : () => setMobileOpen(false)}
        onNavigate={() => setMobileOpen(false)}
      />

      {/* Main Workspace: White Content Panel + Full-width Map */}
      <div className={`app-workspace ${panelOpen ? 'has-open-content-panel' : ''}`}>
        <aside
          className={`app-content-panel ${!panelOpen ? 'is-collapsed' : ''}`}
          aria-label="Panel de información del módulo"
        >
          <Outlet />
        </aside>

        <MonitoringMap />
      </div>

      {/* Operational KPIs Dialog */}
      <KpisModal
        visible={kpisOpen}
        onHide={() => setKpisOpen(false)}
        snapshot={snapshot}
        unitsCount={units.length}
        activeTrips={activeTripsCount}
        insideSede={unitsInsideSede}
        onRefresh={refresh}
        isRefreshing={isRefreshing}
      />
    </div>
  );
}

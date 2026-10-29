import { useCallback, useRef } from 'react';
import { Button } from 'primereact/button';
import { ProgressSpinner } from 'primereact/progressspinner';

import { AppHeader } from './components/AppHeader';
import { FleetMap, type FleetMapHandle } from './components/FleetMap';
import { FleetPanel } from './components/FleetPanel';
import { useFleet } from './hooks/useFleet';
import type { FleetUnit } from './types/fleet';

export default function App() {
  const { snapshot, units, error, isRefreshing, hasLoaded, refresh } =
    useFleet();
  const mapRef = useRef<FleetMapHandle>(null);

  const handleFocus = useCallback((unit: FleetUnit): void => {
    mapRef.current?.focusUnit(unit);
  }, []);

  const handleFitAll = useCallback((): void => {
    mapRef.current?.fitAll();
  }, []);

  const warning =
    units.length > 0 ? (snapshot?.warning ?? error) : null;
  const showLoadingOverlay = !hasLoaded;
  const showErrorOverlay =
    hasLoaded && units.length === 0 && error !== null;
  const showEmptyOverlay =
    hasLoaded && units.length === 0 && error === null;

  return (
    <div className="app-shell">
      <AppHeader
        snapshot={snapshot}
        isRefreshing={isRefreshing}
        onRefresh={refresh}
      />

      <main className="app-main">
        <aside className="app-sidebar">
          {warning && (
            <div className="status-banner status-banner--warning" role="status">
              <i className="pi pi-exclamation-triangle" aria-hidden="true" />
              <span>{warning}</span>
            </div>
          )}

          <FleetPanel
            units={units}
            loading={isRefreshing && !hasLoaded}
            onFocus={handleFocus}
          />
        </aside>

        <section className="app-map" aria-label="Mapa de la flota">
          <FleetMap ref={mapRef} units={units} onSelect={handleFocus} />

          <div className="map-legend">
            <span>
              <i className="legend-dot legend-dot--on" aria-hidden="true" />
              Encendida
            </span>
            <span>
              <i className="legend-dot legend-dot--off" aria-hidden="true" />
              Detenida
            </span>
          </div>

          <div className="map-controls">
            <Button
              icon="pi pi-expand"
              rounded
              text
              severity="secondary"
              aria-label="Ver toda la flota en el mapa"
              disabled={units.length === 0}
              onClick={handleFitAll}
            />
          </div>

          {showLoadingOverlay && (
            <div className="map-overlay">
              <div className="map-overlay__card">
                <ProgressSpinner
                  style={{ width: '54px', height: '54px' }}
                  strokeWidth="4"
                />
                <h2>Conectando con la flota</h2>
                <p>Consultando las últimas posiciones del GPS.</p>
              </div>
            </div>
          )}

          {showErrorOverlay && (
            <div className="map-overlay">
              <div className="map-overlay__card">
                <i
                  className="pi pi-wifi map-overlay__icon"
                  aria-hidden="true"
                />
                <h2>Sin conexión con la API</h2>
                <p>{error}</p>
                <Button
                  label="Reintentar"
                  icon="pi pi-refresh"
                  size="small"
                  onClick={refresh}
                />
              </div>
            </div>
          )}

          {showEmptyOverlay && (
            <div className="map-overlay">
              <div className="map-overlay__card">
                <i
                  className="pi pi-map-marker map-overlay__icon"
                  aria-hidden="true"
                />
                <h2>Sin unidades para mostrar</h2>
                <p>El proveedor no reportó posiciones válidas.</p>
                <Button
                  label="Reintentar"
                  icon="pi pi-refresh"
                  size="small"
                  onClick={refresh}
                />
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

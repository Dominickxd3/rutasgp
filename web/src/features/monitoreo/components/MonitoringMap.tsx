import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Button } from 'primereact/button';
import { ProgressSpinner } from 'primereact/progressspinner';
import { FleetMap } from './FleetMap';
import { useAppState } from '../../../context/AppStateContext';
import { MIN_POLYGON_VERTICES } from '../../../lib/geo';

interface MonitoringMapProps {
  onToggleMobileNav?: () => void;
}

function formatTripTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleTimeString('es-PE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  } catch {
    return '--:--';
  }
}

export function MonitoringMap(_props: MonitoringMapProps = {}) {
  const {
    units,
    selectedTrip,
    setSelectedTrip,
    setHistory,
    setSelectedUnit,
    error,
    hasLoaded,
    refresh,
    geofences,
    geofence,
    draftVertices,
    placingShape,
    history,
    showGpsGaps,
    mapRef,
    focusUnit,
    fitAll,
    handlePickPoint,
    handleDraftVertexMove,
    handleGeofenceChange,
    handleCancelPlacement,
    handleUndoDraftVertex,
    handleFinishPolygon,
  } = useAppState();

  const location = useLocation();
  const isTripsRoute = location.pathname.startsWith('/monitoreo/recorridos');

  const [filterSelectedTrip, setFilterSelectedTrip] = useState(true);
  const [filterOtherTrips, setFilterOtherTrips] = useState(false);
  const [followTruck, setFollowTruck] = useState(true);
  const [mapMode, setMapMode] = useState<'map' | 'satellite'>('map');

  const showLoadingOverlay = !hasLoaded;
  const showErrorOverlay = hasLoaded && units.length === 0 && error !== null;
  const showEmptyOverlay = hasLoaded && units.length === 0 && error === null;

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  };

  // Unit matching selected trip if available
  const matchingUnit = useMemo(() => {
    return selectedTrip ? units.find((u) => u.placa === selectedTrip.placa) ?? null : null;
  }, [units, selectedTrip]);

  // Si hay un camión/recorrido seleccionado, solo mostramos ese camión (a menos que se active "Otros recorridos")
  const displayedUnits = useMemo(() => {
    if (selectedTrip) {
      if (filterOtherTrips) return units;
      return matchingUnit ? [matchingUnit] : [];
    }
    return units;
  }, [units, selectedTrip, filterOtherTrips, matchingUnit]);

  // Auto-seguir la posición del camión en el mapa si está activo followTruck y se actualiza el GPS
  useEffect(() => {
    if (!followTruck || !matchingUnit || !mapRef.current) return;
    mapRef.current.panTo?.([matchingUnit.longitud, matchingUnit.latitud]);
  }, [followTruck, matchingUnit?.latitud, matchingUnit?.longitud, mapRef]);

  return (
    <section className="app-map" aria-label="Mapa de la flota">
      {/* Top Floating Toolbar (Screenshot style) */}
      <div className="map-top-bar map-top-bar--recorridos">
        {/* Filters and legend pills */}
        <div className="map-filters-legend-pill">
          <label className="map-legend-check">
            <input
              type="checkbox"
              checked={filterSelectedTrip}
              onChange={(e) => setFilterSelectedTrip(e.target.checked)}
            />
            <span>Recorrido seleccionado</span>
          </label>

          <label className="map-legend-check">
            <input
              type="checkbox"
              checked={filterOtherTrips}
              onChange={(e) => setFilterOtherTrips(e.target.checked)}
            />
            <span>Otros recorridos</span>
          </label>

          <span className="map-legend-tag map-legend-tag--parada">
            <span className="dot-amber" /> Parada
          </span>

          <span className="map-legend-tag map-legend-tag--sede">
            <i className="pi pi-building" /> Sede
          </span>

          <span className="map-legend-tag map-legend-tag--geocerca">
            <span className="box-green" /> Geocerca
          </span>
        </div>

        {/* Map / Satellite switch & Fullscreen */}
        <div className="map-mode-controls">
          <div className="map-mode-toggle" role="tablist">
            <button
              type="button"
              className={`mode-btn ${mapMode === 'map' ? 'is-active' : ''}`}
              onClick={() => setMapMode('map')}
            >
              Mapa
            </button>
            <button
              type="button"
              className={`mode-btn ${mapMode === 'satellite' ? 'is-active' : ''}`}
              onClick={() => setMapMode('satellite')}
            >
              Satélite
            </button>
          </div>

          <button
            type="button"
            className="map-fullscreen-btn"
            title="Pantalla completa"
            onClick={toggleFullscreen}
          >
            <i className="pi pi-expand" />
          </button>
        </div>
      </div>

      <FleetMap
        ref={mapRef}
        units={displayedUnits}
        onSelect={focusUnit}
        geofences={geofences.map((item) => item.geometry)}
        geofenceRecords={geofences}
        geofence={geofence}
        draftVertices={draftVertices}
        placingShape={placingShape}
        onPickPoint={handlePickPoint}
        onDraftVertexMove={handleDraftVertexMove}
        onGeofenceChange={handleGeofenceChange}
        history={filterSelectedTrip ? history : null}
        showGpsGaps={showGpsGaps}
      />

      {/* Standard bottom legend when not in trips view */}
      {!isTripsRoute && !history && (
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
      )}

      {/* Floating Bottom Trip Status Bar (When a Trip is Selected) */}
      {selectedTrip && (
        <div className="map-floating-trip-card">
          <div className="trip-card-main-info">
            <div className="trip-card-icon-box">
              <i className="pi pi-truck trip-card-truck-img" aria-hidden="true" />
            </div>
            <div className="trip-card-texts">
              <div className="trip-card-title-line">
                <strong className="trip-card-plate">{selectedTrip.placa}</strong>
                <span className="trip-card-status-badge">
                  {selectedTrip.estado === 'EN_CURSO' ? 'En ruta' : 'Completado'}
                </span>
              </div>
              <span className="trip-card-subline">
                Recorrido: RD-{selectedTrip.fechaInicioUtc.slice(0, 10).replace(/-/g, '')}-
                {String(selectedTrip.idRecorrido).padStart(4, '0')} | Inicio:{' '}
                {formatTripTime(selectedTrip.fechaInicioUtc)}
              </span>
            </div>
          </div>

          <div className="trip-card-stats-row">
            <div className="trip-stat-item">
              <i className="pi pi-directions" />
              <div>
                <strong>
                  {selectedTrip.distanciaObservadaM
                    ? (selectedTrip.distanciaObservadaM / 1000).toFixed(1)
                    : '0.0'}{' '}
                  km
                </strong>
                <span>Recorrido</span>
              </div>
            </div>

            <div className="trip-stat-item">
              <i className="pi pi-map-marker" />
              <div>
                <strong>{selectedTrip.cantidadParadas}</strong>
                <span>Paradas</span>
              </div>
            </div>

            <div className="trip-stat-item">
              <i className="pi pi-gauge" />
              <div>
                <strong>{matchingUnit?.velocidad ?? 0} km/h</strong>
                <span>Velocidad</span>
              </div>
            </div>

            <div className="trip-stat-item trip-stat-item--gps">
              <i className="pi pi-wifi" />
              <div>
                <strong>GPS</strong>
                <span>En línea</span>
              </div>
            </div>
          </div>

          <div className="trip-card-actions">
            <button
              type="button"
              className={`trip-card-follow-btn ${followTruck ? 'is-active' : ''}`}
              onClick={() => {
                setFollowTruck((prev) => !prev);
                if (matchingUnit) {
                  mapRef.current?.panTo?.([matchingUnit.longitud, matchingUnit.latitud]);
                }
              }}
              title={
                followTruck
                  ? 'Siguiendo camión en tiempo real (clic para pausar)'
                  : 'Centrar y seguir camión en vivo'
              }
            >
              <i className={`pi ${followTruck ? 'pi-compass' : 'pi-map-marker'}`} />
              <span>{followTruck ? 'Siguiendo' : 'Seguir'}</span>
            </button>

            <button
              type="button"
              className="trip-card-detail-btn"
              onClick={fitAll}
              title="Ver recorrido completo"
            >
              <span>Ver ruta</span>
              <i className="pi pi-arrow-up-right" />
            </button>

            <button
              type="button"
              className="trip-card-close-btn"
              onClick={() => {
                setSelectedTrip(null);
                setHistory(null);
                setSelectedUnit(null);
                fitAll();
              }}
              title="Deseleccionar recorrido y ver todos los camiones"
              aria-label="Cerrar recorrido"
            >
              <i className="pi pi-times" />
            </button>
          </div>
        </div>
      )}

      {/* Geofence Placement Hints */}
      {placingShape === 'circle' && (
        <div className="geofence-hint" role="status">
          <i className="pi pi-map-marker" aria-hidden="true" />
          <span>Haz clic en el mapa para fijar el centro de la geocerca.</span>
          <button
            type="button"
            className="geofence-hint__cancel"
            onClick={handleCancelPlacement}
          >
            Cancelar
          </button>
        </div>
      )}

      {placingShape === 'polygon' && (
        <div className="geofence-hint" role="status">
          <i className="pi pi-pencil" aria-hidden="true" />
          <span>
            {draftVertices.length === 0
              ? 'Haz clic en el mapa para agregar el primer vértice.'
              : `${draftVertices.length} ${
                  draftVertices.length === 1 ? 'vértice' : 'vértices'
                } · Haz clic para agregar más.`}
          </span>
          {draftVertices.length > 0 && (
            <button
              type="button"
              className="geofence-hint__undo"
              onClick={handleUndoDraftVertex}
            >
              Deshacer
            </button>
          )}
          <button
            type="button"
            className="geofence-hint__action"
            disabled={draftVertices.length < MIN_POLYGON_VERTICES}
            onClick={handleFinishPolygon}
          >
            Cerrar
          </button>
          <button
            type="button"
            className="geofence-hint__cancel"
            onClick={handleCancelPlacement}
          >
            Cancelar
          </button>
        </div>
      )}

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
            <i className="pi pi-wifi map-overlay__icon" aria-hidden="true" />
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
  );
}

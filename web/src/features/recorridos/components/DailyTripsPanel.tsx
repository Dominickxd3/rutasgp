import { useMemo, useState } from 'react';
import { useDailyTrips } from '../hooks/useDailyTrips';
import { formatTime } from '../utils/trips-format.utils';
import type { DailyTripsPanelProps } from '../types/daily-trips-panel.types';
import type { TripRecord } from '../types/trip.types';

export function DailyTripsPanel({
  onVisualization,
  onActiveCountChange,
  onTripSelected,
  selectedTrip,
  liveEnabled = true,
}: DailyTripsPanelProps) {
  const {
    date,
    setDate,
    trips,
    loading,
    consolidating,
    error,
    selectedTripId,
    loadingTripId,
    stats,
    handleConsolidate,
    handleSelectTrip,
  } = useDailyTrips({
    onVisualization,
    onActiveCountChange,
    onTripSelected,
    selectedTrip,
    liveEnabled,
  });

  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState<'all' | 'active' | 'finished'>('all');

  // Filter trips by search query (plate, status, sede) and selected tab
  const filteredTrips = useMemo(() => {
    const q = search.trim().toLowerCase();
    return trips.filter((t) => {
      const matchesSearch =
        !q ||
        t.placa.toLowerCase().includes(q) ||
        t.estado.toLowerCase().includes(q) ||
        (t.sedeNombre?.toLowerCase().includes(q) ?? false);

      const matchesTab =
        tabFilter === 'all' ||
        (tabFilter === 'active' && t.estado === 'EN_CURSO') ||
        (tabFilter === 'finished' && t.estado !== 'EN_CURSO');

      return matchesSearch && matchesTab;
    });
  }, [trips, search, tabFilter]);

  return (
    <section className="fleet-panel daily-trips-panel">
      {/* Clean, Streamlined Header */}
      <header className="daily-trips-header">
        {/* Row 1: Title & Controls */}
        <div className="daily-trips-top-bar">
          <h2 className="daily-trips-title">Recorridos del Día</h2>

          <div className="daily-trips-date-controls">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="daily-trips-date-input"
              aria-label="Seleccionar fecha"
            />
            <button
              type="button"
              className="daily-trips-sync-btn"
              title="Actualizar y sincronizar"
              disabled={loading || consolidating}
              onClick={() => void handleConsolidate()}
            >
              <i
                className={`pi pi-sync ${
                  loading || consolidating ? 'pi-spin' : ''
                }`}
                aria-hidden="true"
              />
            </button>
          </div>
        </div>

        {/* Row 2: Search input */}
        <div className="daily-trips-search-wrap">
          <i className="pi pi-search search-icon" aria-hidden="true" />
          <input
            type="text"
            placeholder="Buscar por placa o sede..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="daily-trips-search-input"
          />
          {search && (
            <button
              type="button"
              className="clear-search-btn"
              onClick={() => setSearch('')}
              title="Limpiar búsqueda"
            >
              <i className="pi pi-times" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Row 3: Actionable Segment Tabs */}
        <div className="daily-trips-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tabFilter === 'all'}
            className={`trips-tab ${tabFilter === 'all' ? 'is-active' : ''}`}
            onClick={() => setTabFilter('all')}
          >
            Todos <span className="tab-badge">{stats.total}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tabFilter === 'active'}
            className={`trips-tab ${tabFilter === 'active' ? 'is-active' : ''}`}
            onClick={() => setTabFilter('active')}
          >
            En ruta{' '}
            <span className="tab-badge is-active-badge">{stats.active}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tabFilter === 'finished'}
            className={`trips-tab ${tabFilter === 'finished' ? 'is-active' : ''}`}
            onClick={() => setTabFilter('finished')}
          >
            Completados <span className="tab-badge">{stats.finished}</span>
          </button>
        </div>

        {/* Row 4: Subtle Muted Summary */}
        <div className="daily-trips-summary-line">
          <span>{stats.totalKm} km totales</span>
          <span className="dot-sep">•</span>
          <span>{stats.totalStops} paradas</span>
        </div>
      </header>

      {/* Body: Trips List */}
      <div className="daily-trips-list-container">
        {error && <div className="trips-error-banner">{error}</div>}

        {filteredTrips.length === 0 && !loading && (
          <div className="trips-empty-message">
            <i className="pi pi-info-circle" aria-hidden="true" />
            <span>No hay recorridos que coincidan con la búsqueda.</span>
          </div>
        )}

        {filteredTrips.map((trip: TripRecord) => {
          const isSelected = trip.idRecorrido === selectedTripId;
          const isLoadingThis = loadingTripId === trip.idRecorrido;
          const km = trip.distanciaObservadaM
            ? (trip.distanciaObservadaM / 1000).toFixed(1)
            : '0.0';
          const pct = trip.coberturaGpsPct ?? 100;
          const isEnRuta = trip.estado === 'EN_CURSO';

          return (
            <div
              key={trip.idRecorrido}
              className={`trip-record-card ${isSelected ? 'is-selected' : ''}`}
              onClick={() => void handleSelectTrip(trip)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSelectTrip(trip);
              }}
            >
              {/* Card Top Row: Icon + Plate + Status + Arrow */}
              <div className="trip-card-header">
                <div className="trip-card-left">
                  <div className="trip-truck-badge">
                    <i className="pi pi-truck" aria-hidden="true" />
                  </div>
                  <strong className="trip-plate-title">{trip.placa}</strong>
                </div>

                <div className="trip-card-right">
                  <span
                    className={`trip-status-pill ${
                      isEnRuta
                        ? 'trip-status-pill--active'
                        : 'trip-status-pill--done'
                    }`}
                  >
                    {isEnRuta ? 'En ruta' : 'Completado'}
                  </span>
                  <i
                    className="pi pi-angle-right trip-arrow-icon"
                    aria-hidden="true"
                  />
                </div>
              </div>

              {/* Card Middle Row: Metrics & Progress */}
              <div className="trip-card-metrics-row">
                <div className="metric-chip">
                  <i className="pi pi-clock" aria-hidden="true" />
                  <span>Salida {formatTime(trip.fechaInicioUtc)}</span>
                </div>

                <div className="metric-chip">
                  <i className="pi pi-directions" aria-hidden="true" />
                  <span>Distancia {km} km</span>
                </div>

                <div className="metric-chip">
                  <i className="pi pi-map-marker" aria-hidden="true" />
                  <span>Paradas {trip.cantidadParadas}</span>
                </div>

                <div className="metric-progress-chip">
                  <span className="progress-pct-text">{pct.toFixed(2)} %</span>
                  <div className="progress-bar-bg">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Card Bottom Row: Action Buttons */}
              <div
                className="trip-card-actions-row"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className={`trip-action-btn ${isSelected ? 'is-active-btn' : ''}`}
                  disabled={isLoadingThis}
                  onClick={() => void handleSelectTrip(trip)}
                  title={isSelected ? 'Clic para quitar del mapa y ver todos los camiones' : 'Ver recorrido en el mapa'}
                >
                  <i className={`pi ${isSelected ? 'pi-times' : 'pi-map'}`} aria-hidden="true" />
                  <span>{isSelected ? 'Quitar del mapa' : 'Ver en mapa'}</span>
                </button>

                <button
                  type="button"
                  className="trip-action-btn trip-action-btn--play"
                  disabled={isLoadingThis}
                  onClick={() => void handleSelectTrip(trip)}
                >
                  <i className="pi pi-play" aria-hidden="true" />
                  <span>Reproducir</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

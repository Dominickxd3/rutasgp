import { HistoryStops } from './HistoryStops';
import { Button } from 'primereact/button';
import { useHistoryPanel } from '../hooks/useHistoryPanel';
import { downloadCsv } from '../services/history-export.service';
import type { HistoryPanelProps } from '../types/history-panel.types';

export function HistoryPanel({
  onVisualization,
  geofences,
  isTab = true,
}: HistoryPanelProps) {
  const {
    open,
    setOpen,
    vehicles,
    vehicleId,
    setVehicleId,
    date,
    setDate,
    fromTime,
    setFromTime,
    toTime,
    setToTime,
    result,
    visiblePoints,
    setVisiblePoints,
    playing,
    setPlaying,
    speed,
    setSpeed,
    loading,
    error,
    transitions,
    consult,
  } = useHistoryPanel({ onVisualization, geofences });

  const bodyContent = (
    <div className="history-panel__body">
      <label>
        <span>Vehículo</span>
        <select
          value={vehicleId}
          onChange={(event) => setVehicleId(event.target.value)}
        >
          {vehicles.map((vehicle) => (
            <option key={vehicle.id} value={vehicle.id}>
              {vehicle.plate}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span>Fecha</span>
        <input
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <div className="history-panel__times">
        <label>
          <span>Desde</span>
          <input
            type="time"
            value={fromTime}
            onChange={(event) => setFromTime(event.target.value)}
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            type="time"
            value={toTime}
            onChange={(event) => setToTime(event.target.value)}
          />
        </label>
      </div>
      <Button
        label="Consultar recorrido"
        icon="pi pi-search"
        size="small"
        loading={loading}
        disabled={!vehicleId}
        onClick={() => void consult()}
      />
      {error && <p className="history-panel__error">{error}</p>}
      {result && (
        <>
          {result.departureObserved === false && (
            <div className="history-departure-notice">
              <i className="pi pi-info-circle" />
              <div>
                <strong>Salida de sede no observada</strong>
                <span>
                  Se visualiza desde la primera posición disponible; no se
                  dibuja una salida desde la empresa.
                </span>
                {result.departureNotice && (
                  <small>{result.departureNotice}</small>
                )}
              </div>
            </div>
          )}
          {result.departureObserved === true && (
            <div className="history-departure-badge is-observed">
              <i className="pi pi-check-circle" /> Salida de sede confirmada por
              GPS
            </div>
          )}
          <dl className="history-panel__stats">
            <div>
              <dt>Puntos</dt>
              <dd>{result.pagination.total}</dd>
            </div>
            <div>
              <dt>Distancia observada</dt>
              <dd>
                {(result.statistics.observedDistanceMeters / 1000).toFixed(1)}{' '}
                km
              </dd>
            </div>
            <div>
              <dt>Paradas</dt>
              <dd>{result.statistics.stops}</dd>
            </div>
            <div>
              <dt>Sin cobertura</dt>
              <dd>{result.statistics.gaps}</dd>
            </div>
          </dl>
          {result.mapMatching && (
            <div
              className={`history-map-matching ${result.mapMatching.applied ? 'is-applied' : 'is-estimated'}`}
            >
              <i
                className={
                  result.mapMatching.applied
                    ? 'pi pi-directions'
                    : 'pi pi-exclamation-triangle'
                }
              />
              <span>
                {result.mapMatching.applied
                  ? `Recorrido ajustado a calles con ${result.mapMatching.provider}.`
                  : 'No fue posible ajustar el recorrido; los enlaces se muestran como estimados.'}
              </span>
            </div>
          )}
          {result.stopCriteria && (
            <div className="history-stop-criteria">
              <strong>¿Cómo se detecta una parada?</strong>
              <span>
                Al menos {Math.round(result.stopCriteria.minimumSeconds / 60)}{' '}
                min dentro de un radio de {result.stopCriteria.radiusMeters} m y
                velocidad máxima de {result.stopCriteria.maximumSpeedKmh} km/h.
              </span>
              <small>
                Es una parada GPS observada; no confirma una entrega.
              </small>
            </div>
          )}
          <HistoryStops stops={result.stops} />
          {transitions.length > 0 && (
            <div className="history-panel__events">
              <strong>Geocercas de sede</strong>
              {transitions.map((event, index) => (
                <span key={`${event.name}-${event.date}-${index}`}>
                  <i
                    className={`pi ${event.type === 'entrada' ? 'pi-sign-in' : 'pi-sign-out'}`}
                  />{' '}
                  {event.type === 'entrada' ? 'Entrada' : 'Salida'} ·{' '}
                  {event.name} ·{' '}
                  {new Date(event.date).toLocaleTimeString('es-PE')}
                </span>
              ))}
            </div>
          )}
          {result.pagination.pages > 1 && (
            <p className="history-panel__warning">
              Se muestra el primer segmento de {result.pagination.pages}. Acota
              el horario para ver el recorrido completo.
            </p>
          )}
          <div className="history-panel__playback">
            <Button
              icon={playing ? 'pi pi-pause' : 'pi pi-play'}
              rounded
              text
              aria-label="Reproducir recorrido"
              onClick={() => {
                if (visiblePoints >= result.points.length) setVisiblePoints(1);
                setPlaying((value) => !value);
              }}
            />
            <input
              type="range"
              min="1"
              max={Math.max(1, result.points.length)}
              value={Math.max(1, visiblePoints)}
              onChange={(event) => {
                setPlaying(false);
                setVisiblePoints(Number(event.target.value));
              }}
            />
            <select
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            >
              <option value="1">1×</option>
              <option value="5">5×</option>
              <option value="20">20×</option>
            </select>
          </div>
          <Button
            label="Exportar CSV"
            icon="pi pi-download"
            size="small"
            text
            onClick={() => downloadCsv(result)}
          />
          <p className="history-panel__notice">{result.precisionNotice}</p>
        </>
      )}
    </div>
  );

  if (isTab) {
    return (
      <section className="fleet-panel history-custom-panel">
        <header className="fleet-panel__head">
          <div className="fleet-panel__heading">
            <div>
              <p className="fleet-panel__eyebrow">Consulta Temporal</p>
              <h2>Historial de Recorridos</h2>
            </div>
          </div>
        </header>
        {bodyContent}
      </section>
    );
  }

  return (
    <section className={`history-panel ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="history-panel__toggle"
        onClick={() => setOpen((value) => !value)}
      >
        <span>
          <i className="pi pi-history" /> Historial de recorridos
        </span>
        <i className={`pi ${open ? 'pi-chevron-up' : 'pi-chevron-down'}`} />
      </button>
      {open && bodyContent}
    </section>
  );
}

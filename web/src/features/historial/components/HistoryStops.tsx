import type { HistoryResult } from '../types/history.types';

export function HistoryStops({ stops }: Pick<HistoryResult, 'stops'>) {
  if (stops.length === 0) return null;
  return (
    <div className="history-stop-section">
      <div className="history-stop-section__header">
        <strong>Paradas identificadas ({stops.length})</strong>
        <small>Evidencia y calidad de inmovilidad</small>
      </div>
      <div className="history-stop-list">
        {stops.map((stop, index) => {
          const confClass =
            stop.confidence === 'ALTA'
              ? 'is-conf-alta'
              : stop.confidence === 'MEDIA'
                ? 'is-conf-media'
                : 'is-conf-baja';

          return (
            <div key={`${stop.start}-${index}`} className="history-stop-card">
              <div className="history-stop-card__top">
                <div className="history-stop-card__title">
                  <i className="pi pi-pause-circle" />
                  <span>
                    {new Date(stop.start).toLocaleTimeString('es-PE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}{' '}
                    –{' '}
                    {new Date(stop.end).toLocaleTimeString('es-PE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  <span className="history-stop-card__duration">
                    {Math.round(stop.seconds / 60)} min
                  </span>
                </div>
                <div className="history-stop-card__badges">
                  {stop.locationType === 'SEDE' ? (
                    <span className="history-stop-badge is-sede">
                      <i className="pi pi-building" />{' '}
                      {stop.sedeNombre ? `Sede: ${stop.sedeNombre}` : 'En sede'}
                    </span>
                  ) : stop.locationType === 'CLIENTE' ? (
                    <span className="history-stop-badge is-cliente">
                      <i className="pi pi-user" /> Cliente
                    </span>
                  ) : (
                    <span className="history-stop-badge is-ruta">
                      <i className="pi pi-map-marker" /> En ruta
                    </span>
                  )}

                  {stop.detectionType === 'PROBABLE' ? (
                    <span className="history-stop-badge is-probable">
                      <i className="pi pi-question-circle" /> Probable
                    </span>
                  ) : (
                    <span className="history-stop-badge is-observada">
                      <i className="pi pi-check-circle" /> Observada
                    </span>
                  )}

                  {stop.confidence && (
                    <span
                      className={`history-stop-badge ${confClass}`}
                      title={stop.confidenceReason}
                    >
                      Confianza {stop.confidence.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>

              <div className="history-stop-card__metrics">
                <span>
                  <strong>Muestras:</strong> {stop.samples ?? '—'}
                  {stop.distinctCoordinates !== undefined
                    ? ` (${stop.distinctCoordinates} coord.)`
                    : ''}
                </span>
                {stop.distinctGpsTimestamps !== undefined && (
                  <span>
                    <strong>Tiempos GPS:</strong> {stop.distinctGpsTimestamps}{' '}
                    únicos
                  </span>
                )}
                {stop.maxGapSeconds !== undefined && (
                  <span>
                    <strong>Mayor salto:</strong> {stop.maxGapSeconds}s
                  </span>
                )}
                {stop.coverageRatioPct !== undefined && (
                  <span>
                    <strong>Cobertura:</strong> {stop.coverageRatioPct}%
                  </span>
                )}
                {stop.engineState && (
                  <span>
                    <strong>Motor:</strong> {stop.engineState}
                  </span>
                )}
                {stop.radiusMeters !== undefined && (
                  <span>
                    <strong>Radio:</strong> {stop.radiusMeters}m
                  </span>
                )}
              </div>

              {stop.hasRepeatedCoordinates && (
                <div className="history-stop-card__note">
                  <i className="pi pi-info-circle" />
                  <span>
                    Coordenadas idénticas registradas en todas las muestras
                    (radio 0 m).
                  </span>
                </div>
              )}
              {stop.confidenceReason && (
                <div className="history-stop-card__reason">
                  <small>{stop.confidenceReason}</small>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

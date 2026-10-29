import { Button } from 'primereact/button';

import { formatIsoTime, formatRelativeTime } from '../lib/format';
import type { FleetSnapshot } from '../types/fleet';

interface AppHeaderProps {
  snapshot: FleetSnapshot | null;
  isRefreshing: boolean;
  onRefresh: () => void;
}

export function AppHeader({
  snapshot,
  isRefreshing,
  onRefresh,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header__brand">
        <span className="app-header__logo" aria-hidden="true">
          <i className="pi pi-map-marker" />
        </span>
        <div>
          <p className="app-header__eyebrow">Distribución de rutas</p>
          <h1 className="app-header__title">Monitoreo de flota</h1>
        </div>
      </div>

      <dl className="app-header__stats">
        <div className="header-stat">
          <dt>Unidades</dt>
          <dd>{snapshot?.total ?? 0}</dd>
        </div>
        <div className="header-stat header-stat--moving">
          <dt>En movimiento</dt>
          <dd>{snapshot?.moving ?? 0}</dd>
        </div>
        <div className="header-stat header-stat--stopped">
          <dt>Detenidas</dt>
          <dd>{snapshot?.stopped ?? 0}</dd>
        </div>
      </dl>

      <div className="app-header__actions">
        <div className="app-header__updated" aria-live="polite">
          <span
            className={`live-dot${isRefreshing ? ' is-syncing' : ''}`}
            aria-hidden="true"
          />
          <span>
            {snapshot
              ? `Actualizado ${formatIsoTime(snapshot.updatedAt)} · ${formatRelativeTime(
                  snapshot.updatedAt,
                )}`
              : 'Esperando datos del GPS'}
          </span>
        </div>
        <Button
          className="app-header__refresh"
          icon="pi pi-refresh"
          label="Actualizar"
          size="small"
          outlined
          severity="info"
          loading={isRefreshing}
          onClick={onRefresh}
        />
      </div>
    </header>
  );
}

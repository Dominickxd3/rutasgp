import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import type { FleetSnapshot } from '../../features/flota/types/fleet.types';
import { formatIsoTime, formatRelativeTime } from '../../lib/format';

interface KpisModalProps {
  visible: boolean;
  onHide: () => void;
  snapshot: FleetSnapshot | null;
  unitsCount: number;
  activeTrips: number;
  insideSede: number;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export function KpisModal({
  visible,
  onHide,
  snapshot,
  unitsCount,
  activeTrips,
  insideSede,
  onRefresh,
  isRefreshing,
}: KpisModalProps) {
  const moving = snapshot?.moving ?? 0;
  const stopped = snapshot?.stopped ?? 0;
  const total = snapshot?.total ?? unitsCount;
  const movingRatio = total > 0 ? Math.round((moving / total) * 100) : 0;

  return (
    <Dialog
      header="Indicadores Operativos (KPIs) - Flota"
      visible={visible}
      onHide={onHide}
      className="kpis-dialog"
      style={{ width: '480px', maxWidth: '95vw' }}
      draggable={false}
      resizable={false}
      dismissableMask
    >
      <div className="kpis-grid">
        <div className="kpi-card">
          <span className="kpi-card__label">Total Unidades</span>
          <span className="kpi-card__value">{total}</span>
          <span className="kpi-card__sub">Flota monitoreada</span>
        </div>

        <div className="kpi-card kpi-card--moving">
          <span className="kpi-card__label">En Ruta</span>
          <span className="kpi-card__value">{moving}</span>
          <span className="kpi-card__sub">{movingRatio}% de la flota</span>
        </div>

        <div className="kpi-card kpi-card--stopped">
          <span className="kpi-card__label">Detenidas / Ralentí</span>
          <span className="kpi-card__value">{stopped}</span>
          <span className="kpi-card__sub">En parada temporal</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card__label">En Sede Central</span>
          <span className="kpi-card__value">{insideSede}</span>
          <span className="kpi-card__sub">Dentro de geocerca sede</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card__label">Recorridos Activos</span>
          <span className="kpi-card__value">{activeTrips}</span>
          <span className="kpi-card__sub">Despachos en progreso</span>
        </div>

        <div className="kpi-card">
          <span className="kpi-card__label">Último Reporte</span>
          <span className="kpi-card__value kpi-card__value--time">
            {snapshot ? formatIsoTime(snapshot.updatedAt) : '--:--'}
          </span>
          <span className="kpi-card__sub">
            {snapshot ? formatRelativeTime(snapshot.updatedAt) : 'Esperando GPS'}
          </span>
        </div>
      </div>

      <div className="kpis-dialog__footer">
        <Button
          label="Actualizar métricas"
          icon="pi pi-refresh"
          size="small"
          outlined
          loading={isRefreshing}
          onClick={onRefresh}
        />
        <Button label="Cerrar" size="small" severity="secondary" onClick={onHide} />
      </div>
    </Dialog>
  );
}


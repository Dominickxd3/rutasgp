import type { AppHeaderProps } from '../types/header.types';
import { formatIsoTime } from '../../lib/format';

export function AppHeader({
  snapshot,
  isRefreshing,
  onRefresh,
  onMenuClick,
}: AppHeaderProps) {
  return (
    <header className="app-header">
      {/* Brand Section */}
      <div className="app-header__brand-section">
        {onMenuClick && (
          <button
            type="button"
            className="app-header__menu-btn"
            aria-label="Abrir menú de navegación"
            onClick={onMenuClick}
          >
            <i className="pi pi-bars" aria-hidden="true" />
          </button>
        )}
        <div className="app-header__gp-logo" aria-hidden="true">
          GP
        </div>
        <div className="app-header__brand-text">
          <span className="brand-title">Grupo Pecuario</span>
          <span className="brand-sub">Logística y Distribución</span>
        </div>
      </div>

      {/* Module Title Section */}
      <div className="app-header__module-section">
        <div className="module-icon-box" aria-hidden="true">
          <i className="pi pi-truck" />
        </div>
        <div className="module-title-text">
          <span className="module-main-title">Distribución de Rutas</span>
          <span className="module-sub-title">Monitoreo de flota</span>
        </div>
      </div>

      {/* Stats Pills (Center) */}
      <div className="app-header__stats">
        <div className="header-stat-pill header-stat-pill--units">
          <div className="pill-icon pill-icon--units">
            <i className="pi pi-truck" aria-hidden="true" />
          </div>
          <div className="pill-content">
            <span className="pill-label">Unidades</span>
            <span className="pill-value">{snapshot?.total ?? 0}</span>
          </div>
        </div>

        <div className="header-stat-pill header-stat-pill--moving">
          <div className="pill-icon pill-icon--moving">
            <i className="pi pi-play" aria-hidden="true" />
          </div>
          <div className="pill-content">
            <span className="pill-label">En movimiento</span>
            <span className="pill-value">{snapshot?.moving ?? 0}</span>
          </div>
        </div>

        <div className="header-stat-pill header-stat-pill--stopped">
          <div className="pill-icon pill-icon--stopped">
            <i className="pi pi-pause" aria-hidden="true" />
          </div>
          <div className="pill-content">
            <span className="pill-label">Detenidas</span>
            <span className="pill-value">{snapshot?.stopped ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Right Actions */}
      <div className="app-header__actions">
        <div className="app-header__updated">
          <span
            className={`live-dot ${isRefreshing ? 'is-syncing' : ''}`}
            aria-hidden="true"
          />
          <span>
            {snapshot
              ? `Actualizado: ${formatIsoTime(snapshot.updatedAt)}`
              : 'Conectando con GPS...'}
          </span>
        </div>

        <button
          type="button"
          className="app-header__refresh-btn"
          disabled={isRefreshing}
          onClick={onRefresh}
          title="Actualizar datos de flota"
        >
          <i className={`pi pi-sync ${isRefreshing ? 'pi-spin' : ''}`} aria-hidden="true" />
          <span>Actualizar</span>
        </button>

        <button
          type="button"
          className="app-header__icon-btn"
          title="Notificaciones y alertas"
          aria-label="Notificaciones"
        >
          <i className="pi pi-bell" aria-hidden="true" />
        </button>

        <div className="app-header__user-avatar" title="Despacho Operativo">
          DO
        </div>
      </div>
    </header>
  );
}

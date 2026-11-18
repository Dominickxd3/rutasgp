import { useState } from 'react';

import type { MobileLiveDevice, MobileLiveResult } from '../services/mobile-devices.service';

interface Props {
  data: MobileLiveResult | null;
  error: string | null;
  onFocus?: (lngLat: [number, number]) => void;
}

const STOP_LABELS: Record<string, string> = {
  POSIBLE_ENTREGA: 'posibles entregas',
  TRAFICO: 'tráfico',
  NO_PROGRAMADA: 'no programadas',
  BASE: 'en base',
};

function minutesAgo(iso: string | null | undefined): string {
  if (!iso) return 'sin datos';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  return `hace ${Math.floor(min / 60)} h ${min % 60} min`;
}

function meters(value: number | null): string {
  if (value === null) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} km` : `${value} m`;
}

function DeviceRow({ device, onFocus }: { device: MobileLiveDevice; onFocus?: Props['onFocus'] }) {
  const c = device.comparison;
  const totalStops = Object.values(device.stops).reduce((sum, n) => sum + n, 0);
  const last = device.phone?.last;
  return (
    <div className="mobile-compare__device">
      <div className="mobile-compare__title">
        <button
          type="button"
          className="mobile-compare__name"
          disabled={!last}
          onClick={() => last && onFocus?.([last.longitude, last.latitude])}
          title="Centrar el mapa en el celular"
        >
          <span className="mobile-compare__swatch mobile-compare__swatch--phone" />
          {device.phone?.plate ?? device.deviceId}
        </button>
        {device.truck ? (
          <span className="mobile-compare__pair">
            <span className="mobile-compare__swatch mobile-compare__swatch--truck" />
            {device.truck.plate}
          </span>
        ) : (
          <span className="mobile-compare__unassigned">Sin camión asignado</span>
        )}
      </div>
      <div className="mobile-compare__meta">
        {device.model ?? 'Celular'} · {device.lastUser ?? 'sin usuario'} · última posición {minutesAgo(last?.time)}
      </div>

      <div className="mobile-compare__stats">
        <div><strong>{device.phoneKm.toFixed(1)} km</strong><span>Celular</span></div>
        {c && <div><strong>{c.truckKm.toFixed(1)} km</strong><span>Camión</span></div>}
        {c && <div><strong>{meters(c.currentSeparationM)}</strong><span>Separación ahora</span></div>}
        {c && <div><strong>{c.togetherPct === null ? '—' : `${c.togetherPct}%`}</strong><span>Tiempo juntos</span></div>}
        {c && <div><strong>{meters(c.averageSeparationM)}</strong><span>Separación prom.</span></div>}
        <div><strong>{totalStops}</strong><span>Paradas</span></div>
      </div>

      {totalStops > 0 && (
        <div className="mobile-compare__stops">
          {Object.entries(device.stops).map(([type, n]) => `${n} ${STOP_LABELS[type] ?? type}`).join(' · ')}
        </div>
      )}
      {c && c.pairedSamples === 0 && (
        <div className="mobile-compare__warn">
          Aún no hay lecturas del camión y del celular en los mismos minutos para compararlas.
        </div>
      )}
    </div>
  );
}

/** Resultado del contraste celular vs camión del día (sobre el mapa en vivo). */
export function MobileComparisonCard({ data, error, onFocus }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  if (!data && !error) return null;
  return (
    <aside className={`mobile-compare ${collapsed ? 'is-collapsed' : ''}`} aria-label="Celular vs camión">
      <header className="mobile-compare__head">
        <strong>Celular vs camión · hoy</strong>
        <span className="mobile-compare__legend">
          <span className="mobile-compare__swatch mobile-compare__swatch--truck" /> Camión
          <span className="mobile-compare__swatch mobile-compare__swatch--phone" /> Celular
          <button
            type="button"
            className="mobile-compare__toggle"
            onClick={() => setCollapsed((value) => !value)}
            aria-label={collapsed ? 'Mostrar resultado' : 'Minimizar resultado'}
            title={collapsed ? 'Mostrar resultado' : 'Minimizar resultado'}
          >
            <i className={`pi ${collapsed ? 'pi-chevron-down' : 'pi-chevron-up'}`} />
          </button>
        </span>
      </header>
      {!collapsed && <>

      {error && <div className="mobile-compare__warn">{error}</div>}
      {data && data.devices.length === 0 && (
        <div className="mobile-compare__meta">Ningún celular se ha conectado todavía.</div>
      )}
      {data?.devices.map((device) => (
        <DeviceRow key={device.deviceId} device={device} onFocus={onFocus} />
      ))}
      <footer className="mobile-compare__note">
        Paradas inferidas por GPS: no confirman entregas.
      </footer>
      </>}
    </aside>
  );
}

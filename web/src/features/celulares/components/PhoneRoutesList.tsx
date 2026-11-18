import { useEffect, useMemo, useRef, useState } from 'react';

import { useAppState } from '../../../context/AppStateContext';
import {
  fetchMobileLive,
  limaDayRange,
  type MobileLiveDevice,
  type MobileLiveResult,
} from '../services/mobile-devices.service';

interface Props {
  /** Fecha AAAA-MM-DD elegida en Rutas y recorridos. */
  date: string;
  search: string;
}

const STOP_LABELS: Record<string, string> = {
  POSIBLE_ENTREGA: 'posibles entregas',
  TRAFICO: 'tráfico',
  NO_PROGRAMADA: 'no programadas',
  BASE: 'en base',
};

/** Se refresca la ruta del celular elegido mientras se mira el día de hoy. */
const REFRESH_MS = 30_000;

/**
 * Celulares GPS dentro de Rutas y recorridos: una tarjeta por celular con el
 * mismo estilo que los recorridos de camión. "Ver en mapa" dibuja la ruta del
 * celular (naranja) y la de su camión (azul), ajustadas a calles.
 */
export function PhoneRoutesList({ date, search }: Props) {
  const { phoneOverlay, setPhoneOverlay, setHistory, setSelectedTrip, mapRef } = useAppState();
  const [data, setData] = useState<MobileLiveResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId = phoneOverlay?.devices[0]?.deviceId ?? null;
  const selectedIdRef = useRef(selectedId);
  selectedIdRef.current = selectedId;
  const isToday = date === new Date().toLocaleDateString('en-CA');

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const result = await fetchMobileLive(controller.signal, limaDayRange(date));
        if (cancelled) return;
        setData(result);
        setError(null);
        // Mantener actualizada en el mapa la ruta del celular elegido
        const current = selectedIdRef.current;
        const device = current ? result.devices.find((d) => d.deviceId === current) : null;
        if (current) setPhoneOverlay(device ? { ...result, devices: [device] } : null);
      } catch (err) {
        if (!cancelled && !controller.signal.aborted) {
          setError(err instanceof Error ? err.message : 'No se pudo cargar la ruta de los celulares.');
        }
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };
    void load(false);
    const timer = isToday ? window.setInterval(() => void load(true), REFRESH_MS) : null;
    return () => {
      cancelled = true;
      controller.abort();
      if (timer) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, isToday]);

  // Al salir de Rutas y recorridos se quita la ruta del celular del mapa
  useEffect(() => () => setPhoneOverlay(null), [setPhoneOverlay]);

  const devices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.devices ?? []).filter((d) =>
      !q || [d.deviceId, d.phone?.plate, d.truck?.plate, d.lastUser, d.model]
        .some((value) => value?.toLowerCase().includes(q)));
  }, [data, search]);

  const toggle = (device: MobileLiveDevice) => {
    if (selectedId === device.deviceId) {
      setPhoneOverlay(null);
      return;
    }
    // Se muestra el celular en lugar de un recorrido de camión
    setHistory(null);
    setSelectedTrip(null);
    setPhoneOverlay(data ? { ...data, devices: [device] } : null);
    const last = device.phone?.last;
    if (last) mapRef.current?.panTo?.([last.longitude, last.latitude]);
  };

  if (loading && !data) {
    return (
      <div className="trips-empty-message">
        <i className="pi pi-spin pi-spinner" aria-hidden="true" />
        <span>Cargando celulares...</span>
      </div>
    );
  }

  return (
    <>
      {error && <div className="trips-error-banner">{error}</div>}
      {devices.length === 0 && !loading && (
        <div className="trips-empty-message">
          <i className="pi pi-mobile" aria-hidden="true" />
          <span>No hay celulares con datos en esta fecha.</span>
        </div>
      )}
      {devices.map((device) => {
        const isSelected = device.deviceId === selectedId;
        const c = device.comparison;
        const totalStops = Object.values(device.stops).reduce((sum, n) => sum + n, 0);
        const stopDetail = Object.entries(device.stops)
          .map(([type, n]) => `${n} ${STOP_LABELS[type] ?? type}`)
          .join(' · ');
        const hasRoute = (device.phone?.trail.length ?? 0) >= 2;
        return (
          <div
            key={device.deviceId}
            className={`trip-record-card ${isSelected ? 'is-selected' : ''}`}
            onClick={() => toggle(device)}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => { if (e.key === 'Enter') toggle(device); }}
          >
            <div className="trip-card-header">
              <div className="trip-card-left">
                <div className="trip-truck-badge trip-truck-badge--phone">
                  <i className="pi pi-mobile" aria-hidden="true" />
                </div>
                <strong className="trip-plate-title">{device.phone?.plate ?? device.deviceId}</strong>
              </div>
              <div className="trip-card-right">
                <span className={`trip-status-pill ${device.truck ? 'trip-status-pill--active' : 'trip-status-pill--done'}`}>
                  {device.truck ? `Camión ${device.truck.plate}` : 'Sin camión'}
                </span>
                <i className="pi pi-angle-right trip-arrow-icon" aria-hidden="true" />
              </div>
            </div>

            <div className="trip-card-metrics-row">
              <div className="metric-chip">
                <i className="pi pi-user" aria-hidden="true" />
                <span>{device.lastUser ?? 'sin usuario'}</span>
              </div>
              <div className="metric-chip">
                <i className="pi pi-directions" aria-hidden="true" />
                <span>Celular {device.phoneKm.toFixed(1)} km</span>
              </div>
              {c && (
                <div className="metric-chip">
                  <i className="pi pi-truck" aria-hidden="true" />
                  <span>Camión {c.truckKm.toFixed(1)} km</span>
                </div>
              )}
              <div className="metric-chip" title={stopDetail || undefined}>
                <i className="pi pi-map-marker" aria-hidden="true" />
                <span>Paradas {totalStops}</span>
              </div>
              {c && c.togetherPct !== null && (
                <div className="metric-progress-chip" title="Tiempo con el celular a menos de 150 m del camión">
                  <span className="progress-pct-text">Juntos {c.togetherPct} %</span>
                  <div className="progress-bar-bg">
                    <div className="progress-bar-fill" style={{ width: `${c.togetherPct}%` }} />
                  </div>
                </div>
              )}
            </div>

            {stopDetail && <div className="phone-route-stops">{stopDetail}</div>}

            <div className="trip-card-actions-row" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`trip-action-btn ${isSelected ? 'is-active-btn' : ''}`}
                disabled={!hasRoute && !isSelected}
                onClick={() => toggle(device)}
                title={hasRoute ? undefined : 'El celular no tiene recorrido en esta fecha'}
              >
                <i className={`pi ${isSelected ? 'pi-times' : 'pi-map'}`} aria-hidden="true" />
                <span>{isSelected ? 'Quitar del mapa' : 'Ver en mapa'}</span>
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

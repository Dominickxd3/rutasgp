import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dropdown } from 'primereact/dropdown';

import { useAppState } from '../../../context/AppStateContext';
import {
  fetchAssignableVehicles,
  fetchMobileLive,
  limaDayRange,
  type AssignableVehicle,
  type MobileLiveDevice,
  type MobileLiveResult,
} from '../services/mobile-devices.service';

interface Props {
  /** Fecha AAAA-MM-DD elegida en Rutas y recorridos. */
  date: string;
  search: string;
}

/** Nombre del dispositivo (marca y modelo, sin la versión de Android). */
function deviceName(device: MobileLiveDevice): string {
  return device.model?.replace(/\s*\(Android[^)]*\)\s*$/i, '').trim() || device.phone?.plate || device.deviceId;
}

const STOP_LABELS: Record<string, string> = {
  POSIBLE_ENTREGA: 'posibles entregas',
  TRAFICO: 'tráfico',
  NO_PROGRAMADA: 'no programadas',
  BASE: 'en base',
};

/** Se refresca la ruta mientras se mira el día de hoy. */
const REFRESH_MS = 30_000;

/** Valor del selector "Comparar con" para ver solo el celular. */
const ONLY_PHONE = -1;

/**
 * Celulares GPS dentro de Rutas y recorridos. Cada tarjeta permite elegir con
 * qué camión comparar el celular: por defecto el asignado en Celulares GPS; si
 * no tiene, solo el celular. Elegir otro camión aquí no cambia la asignación.
 * "Ver en mapa" dibuja el celular (naranja) y el camión (azul) ajustados a calles.
 */
export function PhoneRoutesList({ date, search }: Props) {
  const { phoneOverlay, setPhoneOverlay, setHistory, setSelectedTrip, mapRef } = useAppState();
  const [data, setData] = useState<MobileLiveResult | null>(null);
  const [vehicles, setVehicles] = useState<AssignableVehicle[]>([]);
  /** Camión elegido para comparar, por celular (sin entrada = el asignado). */
  const [choices, setChoices] = useState<Record<string, number | null>>({});
  /** Resultado de comparar con un camión distinto al asignado. */
  const [overrides, setOverrides] = useState<Record<string, MobileLiveDevice>>({});
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId = phoneOverlay?.devices[0]?.deviceId ?? null;
  const isToday = date === new Date().toLocaleDateString('en-CA');

  const state = useRef({ selectedId, choices, overrides, data });
  state.current = { selectedId, choices, overrides, data };

  useEffect(() => {
    fetchAssignableVehicles()
      .then((list) => setVehicles(list.filter((v) => v.active && !v.plate.startsWith('CEL-'))))
      .catch(() => setVehicles([]));
  }, []);

  /** Lo que se muestra de un celular: la comparación elegida o la asignada. */
  const shown = useCallback(
    (device: MobileLiveDevice): MobileLiveDevice => overrides[device.deviceId] ?? device,
    [overrides],
  );

  const loadOverride = useCallback(async (deviceId: string, vehicleId: number | null, signal?: AbortSignal) => {
    const result = await fetchMobileLive(signal, limaDayRange(date), { deviceId, vehicleId });
    const device = result.devices[0];
    if (!device) return null;
    setOverrides((current) => ({ ...current, [deviceId]: device }));
    return { result, device };
  }, [date]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setOverrides({});
    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const result = await fetchMobileLive(controller.signal, limaDayRange(date));
        if (cancelled) return;
        setData(result);
        setError(null);
        // Mantener actualizada en el mapa la ruta del celular elegido
        const { selectedId: current, choices: chosen } = state.current;
        if (!current) return;
        if (current in chosen) {
          const updated = await loadOverride(current, chosen[current], controller.signal);
          if (!cancelled && updated) setPhoneOverlay({ ...updated.result, devices: [updated.device] });
        } else {
          const device = result.devices.find((d) => d.deviceId === current);
          setPhoneOverlay(device ? { ...result, devices: [device] } : null);
        }
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
  }, [date, isToday, loadOverride, setPhoneOverlay]);

  // Al salir de Rutas y recorridos se quita la ruta del celular del mapa
  useEffect(() => () => setPhoneOverlay(null), [setPhoneOverlay]);

  const devices = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.devices ?? []).filter((d) =>
      !q || [d.deviceId, d.phone?.plate, d.assignedPlate, d.lastUser, d.model]
        .some((value) => value?.toLowerCase().includes(q)));
  }, [data, search]);

  const showOnMap = (device: MobileLiveDevice, result?: MobileLiveResult) => {
    setHistory(null);
    setSelectedTrip(null);
    const base = result ?? state.current.data;
    setPhoneOverlay(base ? { ...base, devices: [device] } : null);
    // Llevar el mapa al celular: encuadra su ruta y la del camión comparado;
    // si no se movió, acerca el mapa a su última posición.
    const points: [number, number][] = [
      ...(device.phone?.road ?? []).flatMap((part) => part.coordinates),
      ...(device.truck?.road ?? []).flatMap((part) => part.coordinates),
    ];
    const last = device.phone?.last;
    if (last) points.push([last.longitude, last.latitude]);
    if (points.length > 0) {
      // Tras dibujar la capa, para que el encuadre no compita con el render
      window.setTimeout(() => mapRef.current?.fitPoints?.(points), 50);
    }
  };

  const toggle = (device: MobileLiveDevice) => {
    if (selectedId === device.deviceId) {
      setPhoneOverlay(null);
      return;
    }
    showOnMap(shown(device));
  };

  const changeComparison = async (device: MobileLiveDevice, value: number) => {
    const vehicleId = value === ONLY_PHONE ? null : value;
    // Volver al camión asignado = sin elección propia
    if (vehicleId === device.assignedVehicleId) {
      setChoices(({ [device.deviceId]: _, ...rest }) => rest);
      setOverrides(({ [device.deviceId]: _, ...rest }) => rest);
      if (selectedId === device.deviceId) showOnMap(device);
      return;
    }
    setChoices((current) => ({ ...current, [device.deviceId]: vehicleId }));
    setLoadingId(device.deviceId);
    try {
      const updated = await loadOverride(device.deviceId, vehicleId);
      if (updated && selectedId === device.deviceId) showOnMap(updated.device, updated.result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo comparar con ese camión.');
    } finally {
      setLoadingId(null);
    }
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
          <span>No hay celulares registrados.</span>
        </div>
      )}
      {devices.map((base) => {
        const device = shown(base);
        const isSelected = device.deviceId === selectedId;
        const c = device.comparison;
        const totalStops = Object.values(device.stops).reduce((sum, n) => sum + n, 0);
        const stopDetail = Object.entries(device.stops)
          .map(([type, n]) => `${n} ${STOP_LABELS[type] ?? type}`)
          .join(' · ');
        // Se puede ver en el mapa aunque el celular no se haya movido (su última posición)
        const hasLocation = Boolean(device.phone?.last);
        const compareValue = device.deviceId in choices
          ? choices[device.deviceId] ?? ONLY_PHONE
          : base.assignedVehicleId ?? ONLY_PHONE;
        const options = [
          { label: 'Solo el celular', value: ONLY_PHONE },
          ...vehicles.map((v) => ({
            label: v.id === base.assignedVehicleId ? `${v.plate} (asignado)` : v.plate,
            value: v.id,
          })),
        ];
        return (
          <div
            key={device.deviceId}
            className={`trip-record-card ${isSelected ? 'is-selected' : ''}`}
            onClick={() => toggle(base)}
            tabIndex={0}
            role="button"
            onKeyDown={(e) => { if (e.key === 'Enter') toggle(base); }}
          >
            <div className="trip-card-header">
              <div className="trip-card-left">
                <div className="trip-truck-badge trip-truck-badge--phone">
                  <i className="pi pi-mobile" aria-hidden="true" />
                </div>
                <strong className="trip-plate-title" title={`Código ${device.deviceId}`}>
                  {deviceName(device)}
                </strong>
              </div>
              <div className="trip-card-right">
                <span className={`trip-status-pill ${base.assignedPlate ? 'trip-status-pill--active' : 'trip-status-pill--done'}`}>
                  {base.assignedPlate ? `Asignado ${base.assignedPlate}` : 'Sin asignar'}
                </span>
                <i className="pi pi-angle-right trip-arrow-icon" aria-hidden="true" />
              </div>
            </div>

            <div className="phone-route-compare" onClick={(e) => e.stopPropagation()}>
              <label htmlFor={`compare-${device.deviceId}`}>Comparar con</label>
              <Dropdown
                inputId={`compare-${device.deviceId}`}
                value={compareValue}
                options={options}
                filter
                className="phone-route-compare__dropdown"
                disabled={loadingId === device.deviceId}
                onChange={(e) => void changeComparison(base, e.value as number)}
              />
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
              {c && device.truck && (
                <div className="metric-chip">
                  <i className="pi pi-truck" aria-hidden="true" />
                  <span>{device.truck.plate} {c.truckKm.toFixed(1)} km</span>
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
              {c && c.pairedSamples === 0 && (
                <div className="metric-chip" title="El camión no reportó en los mismos minutos que el celular">
                  <i className="pi pi-info-circle" aria-hidden="true" />
                  <span>Sin datos simultáneos</span>
                </div>
              )}
            </div>

            {stopDetail && <div className="phone-route-stops">{stopDetail}</div>}

            <div className="trip-card-actions-row" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className={`trip-action-btn ${isSelected ? 'is-active-btn' : ''}`}
                disabled={(!hasLocation && !isSelected) || loadingId === device.deviceId}
                onClick={() => toggle(base)}
                title={hasLocation ? undefined : 'El celular no envió posiciones en esta fecha'}
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

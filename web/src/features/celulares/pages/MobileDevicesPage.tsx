import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { Message } from 'primereact/message';

import {
  assignMobileDevice,
  setMobileDeviceActive,
  fetchAssignableVehicles,
  fetchMobileDevices,
  type AssignableVehicle,
  type MobileDevice,
} from '../services/mobile-devices.service';

const dateFormat = new Intl.DateTimeFormat('es-PE', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Lima',
});

function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
}

/** "hace 3 min", "hace 2 h", "hace 4 d". */
function formatAgo(value: string | null): string {
  if (!value) return '';
  const ms = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(ms) || ms < 0) return '';
  const min = Math.floor(ms / 60_000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.floor(hours / 24)} d`;
}

export function MobileDevicesPage() {
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [vehicles, setVehicles] = useState<AssignableVehicle[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [deviceList, vehicleList] = await Promise.all([fetchMobileDevices(), fetchAssignableVehicles()]);
      setDevices(deviceList);
      // Los vehículos CEL-xxxx son los propios celulares, no camiones asignables
      setVehicles(vehicleList.filter((vehicle) => vehicle.active && !vehicle.plate.startsWith('CEL-')));
      setDrafts({});
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cargar la lista de celulares.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const vehicleOptions = useMemo(
    () => [
      { label: 'Sin asignar', value: null },
      ...vehicles.map((vehicle) => ({ label: vehicle.plate, value: vehicle.id })),
    ],
    [vehicles],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const visible = devices.filter((device) => device.active !== showRetired);
    if (!term) return visible;
    return visible.filter((device) =>
      [device.deviceId, device.plate, device.model, device.lastUser]
        .some((value) => value?.toLowerCase().includes(term)));
  }, [devices, search, showRetired]);

  const pendingCount = devices.filter((device) => device.active && !device.plate).length;

  const changeStatus = async (device: MobileDevice) => {
    if (device.active && !window.confirm('¿Retirar este celular y liberar su camión asignado?')) return;
    setSavingId(device.deviceId);
    setError(null);
    setNotice(null);
    try {
      const updated = await setMobileDeviceActive(device.deviceId, !device.active);
      setDevices((current) => current.map((item) => item.deviceId === updated.deviceId ? updated : item));
      setDrafts((current) => {
        const next = { ...current };
        delete next[device.deviceId];
        return next;
      });
      setNotice(updated.active ? 'Celular reactivado.' : 'Celular retirado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el estado.');
    } finally {
      setSavingId(null);
    }
  };

  /** Asigna el camión elegido; con `unassign` quita el camión del celular. */
  const save = async (device: MobileDevice, unassign = false) => {
    if (unassign && !window.confirm(`¿Quitar el camión ${device.plate} del celular ${device.deviceId}?`)) return;
    const vehicleId = unassign ? null : drafts[device.deviceId] ?? null;
    setSavingId(device.deviceId);
    setError(null);
    setNotice(null);
    try {
      const updated = await assignMobileDevice(device.deviceId, vehicleId);
      setDevices((current) => current.map((item) => (item.deviceId === updated.deviceId ? updated : item)));
      setDrafts((current) => {
        const next = { ...current };
        delete next[device.deviceId];
        return next;
      });
      setNotice(
        updated.plate
          ? `Asignado a ${updated.plate}. La app lo tomará cuando tenga señal.`
          : 'Se quitó el camión del celular.',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la asignación.');
    } finally {
      setSavingId(null);
    }
  };

  return (
    <section className="fleet-panel">
      <header className="fleet-panel__head">
        <div className="fleet-panel__title-row">
          <div>
            <h2 className="fleet-panel__title">Celulares GPS</h2>
            <p className="fleet-panel__subtitle">
              Asigna a cada celular el camión que lleva
            </p>
          </div>
          <Button
            icon="pi pi-refresh"
            rounded
            text
            severity="secondary"
            aria-label="Actualizar lista de celulares"
            className={`fleet-panel__refresh-btn ${loading ? 'is-spinning' : ''}`}
            onClick={() => void load()}
          />
        </div>

        <div className="fleet-panel__search-row">
          <IconField className="fleet-panel__search">
            <InputIcon className="pi pi-search" />
            <InputText
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por código, placa o usuario..."
              aria-label="Buscar celular"
            />
          </IconField>
        </div>

        <div className="fleet-panel__subbar">
          <span className="fleet-panel__units-count">
            {filtered.length} {filtered.length === 1 ? 'celular' : 'celulares'}
            {!showRetired && pendingCount > 0 && ` · ${pendingCount} sin asignar`}
          </span>
          <Button label={showRetired ? 'Ver activos' : 'Ver retirados'} text size="small"
            onClick={() => setShowRetired(!showRetired)} />
        </div>

        {error && <Message severity="error" text={error} className="device-panel__message" />}
        {notice && <Message severity="success" text={notice} className="device-panel__message" />}
      </header>

      <div className="fleet-panel__list" role="list">
        {loading && devices.length === 0 ? (
          <div className="fleet-panel__loading">
            <i className="pi pi-spin pi-spinner" aria-hidden="true" />
            <span>Cargando celulares...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="fleet-panel__empty">
            <i className="pi pi-mobile" aria-hidden="true" />
            <span>
              {showRetired && !devices.some((device) => !device.active)
                ? 'No hay celulares retirados.'
                : devices.length === 0
                ? 'Aún no se conecta ningún celular. Aparecerá aquí cuando inicie sesión en la app GPSCamiones.'
                : !showRetired && !devices.some((device) => device.active)
                ? 'No hay celulares activos.'
                : 'Ningún celular coincide con la búsqueda.'}
            </span>
          </div>
        ) : (
          filtered.map((device) => {
            const value = device.deviceId in drafts ? drafts[device.deviceId] : device.vehicleId;
            const changed = device.deviceId in drafts && drafts[device.deviceId] !== device.vehicleId;
            return (
              <article key={device.deviceId} role="listitem" className="device-card">
                <div className="device-card__top">
                  <span className="device-card__code" title={device.deviceId}>{device.deviceId}</span>
                  <span className={`device-card__badge ${device.plate ? 'is-assigned' : 'is-pending'}`}>
                    {device.active ? device.plate ?? 'Sin asignar' : 'Retirado'}
                  </span>
                </div>

                <div className="device-card__meta">
                  <span><i className="pi pi-mobile" aria-hidden="true" /> {device.model ?? 'Modelo desconocido'}</span>
                  <span><i className="pi pi-user" aria-hidden="true" /> {device.lastUser ?? 'sin usuario'}</span>
                  <span title={formatDate(device.lastSeenAt)}>
                    <i className="pi pi-clock" aria-hidden="true" /> {formatAgo(device.lastSeenAt) || formatDate(device.lastSeenAt)}
                  </span>
                </div>

                {device.active && <div className="device-card__assign">
                  <Dropdown
                    value={value}
                    options={vehicleOptions}
                    filter
                    placeholder="Elegir camión"
                    aria-label={`Camión del celular ${device.deviceId}`}
                    className="device-card__dropdown"
                    onChange={(event) =>
                      setDrafts((current) => ({ ...current, [device.deviceId]: event.value as number | null }))}
                  />
                  <Button
                    label={device.plate ? 'Cambiar' : 'Asignar'}
                    icon="pi pi-check"
                    size="small"
                    disabled={!changed}
                    loading={savingId === device.deviceId}
                    onClick={() => void save(device)}
                  />
                </div>}
                {device.active && device.plate && (
                  <Button
                    label={`Desasignar ${device.plate}`}
                    icon="pi pi-times"
                    size="small"
                    severity="danger"
                    text
                    className="device-card__unassign"
                    disabled={savingId === device.deviceId}
                    onClick={() => void save(device, true)}
                  />
                )}
                <Button label={device.active ? 'Retirar celular' : 'Reactivar celular'} text size="small"
                  severity={device.active ? 'danger' : 'secondary'}
                  disabled={savingId !== null}
                  onClick={() => void changeStatus(device)} />
              </article>
            );
          })
        )}
      </div>
    </section>
  );
}

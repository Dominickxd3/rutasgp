import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { Message } from 'primereact/message';
import { Tag } from 'primereact/tag';

import {
  assignMobileDevice,
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

export function MobileDevicesPage() {
  const [devices, setDevices] = useState<MobileDevice[]>([]);
  const [vehicles, setVehicles] = useState<AssignableVehicle[]>([]);
  const [drafts, setDrafts] = useState<Record<string, number | null>>({});
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
      setVehicles(vehicleList.filter((vehicle) => vehicle.active));
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

  const save = async (device: MobileDevice) => {
    const vehicleId = drafts[device.deviceId] ?? null;
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
          ? `Celular ${device.deviceId} asignado a ${updated.plate}. La app lo tomará cuando tenga señal.`
          : `Se quitó el camión del celular ${device.deviceId}.`,
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
        <div className="fleet-panel__heading">
          <div>
            <p className="fleet-panel__eyebrow">Herramientas</p>
            <h2>Celulares GPS</h2>
          </div>
          <Button
            icon="pi pi-refresh"
            label="Actualizar"
            size="small"
            outlined
            onClick={() => void load()}
            loading={loading}
          />
        </div>
      </header>

      <div style={{ padding: '0 1rem 1rem', display: 'grid', gap: '0.75rem' }}>
        <p style={{ margin: 0 }}>
          Cada celular con la app GPSCamiones aparece aquí después de iniciar sesión. Compara el código con el que
          muestra la app en <strong>Administración → Código del celular</strong> y asígnale un camión.
        </p>
        {error && <Message severity="error" text={error} />}
        {notice && <Message severity="success" text={notice} />}

        <DataTable
          value={devices}
          dataKey="deviceId"
          loading={loading}
          size="small"
          stripedRows
          emptyMessage="Todavía no se ha conectado ningún celular."
        >
          <Column field="deviceId" header="Código del celular" />
          <Column header="Modelo / usuario" body={(row: MobileDevice) => (
            <span>{row.model ?? '—'}<br /><small>{row.lastUser ?? 'sin usuario'}</small></span>
          )} />
          <Column header="Último contacto" body={(row: MobileDevice) => formatDate(row.lastSeenAt)} />
          <Column header="Estado" body={(row: MobileDevice) => (
            row.plate
              ? <Tag value={`Asignado: ${row.plate}`} severity="success" />
              : <Tag value="Pendiente de asignar" severity="warning" />
          )} />
          <Column header="Camión" body={(row: MobileDevice) => {
            const value = row.deviceId in drafts ? drafts[row.deviceId] : row.vehicleId;
            const changed = row.deviceId in drafts && drafts[row.deviceId] !== row.vehicleId;
            return (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <Dropdown
                  value={value}
                  options={vehicleOptions}
                  filter
                  placeholder="Elegir camión"
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [row.deviceId]: event.value as number | null }))}
                  style={{ minWidth: '11rem' }}
                />
                <Button
                  icon="pi pi-check"
                  size="small"
                  aria-label="Guardar asignación"
                  disabled={!changed}
                  loading={savingId === row.deviceId}
                  onClick={() => void save(row)}
                />
              </div>
            );
          }} />
        </DataTable>
      </div>
    </section>
  );
}

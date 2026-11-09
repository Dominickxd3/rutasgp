import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';

import { formatArea } from '../../../lib/format';
import {
  MAX_GEOFENCE_RADIUS,
  MIN_GEOFENCE_RADIUS,
} from '../../../lib/geo';
import type {
  Geofence,
  GeofenceRecord,
  GeofenceShape,
  GeofenceAppearance,
} from '../types/geofence.types';
import { GeofenceAppearanceForm } from './GeofenceAppearanceForm';
import { geofenceAppearance } from '../utils/geofence-appearance.utils';

interface Props {
  geofences: GeofenceRecord[];
  selectedGeofenceId: string | null;
  onSelectGeofenceId: (id: string) => void;
  onClearGeofence: () => void;
  onGeofenceRadiusChange: (radius: number | null) => void;
  onStartPlacement: (shape: GeofenceShape, appearance: GeofenceAppearance) => void;
  onApplyAppearance: (appearance: GeofenceAppearance) => void;
  unitsInsideGeofence: number;
  unitsInsideSede: number;
  totalUnits: number;
  geofenceArea: number;
  placingShape: GeofenceShape | null;
  geofence: Geofence | null;
  selectedGeofenceRecord: GeofenceRecord | null;
}

export function GeofencePanel({
  geofences,
  selectedGeofenceId,
  onSelectGeofenceId,
  onClearGeofence,
  onGeofenceRadiusChange,
  onStartPlacement,
  onApplyAppearance,
  unitsInsideGeofence,
  unitsInsideSede,
  totalUnits,
  geofenceArea,
  placingShape,
  geofence,
  selectedGeofenceRecord,
}: Props) {
  return (
    <section className="fleet-panel geofence-sidebar-panel">
      <header className="fleet-panel__head">
        <div className="fleet-panel__heading">
          <div>
            <p className="fleet-panel__eyebrow">Herramientas</p>
            <h2>Geocercas y clientes</h2>
          </div>
          <span className="fleet-panel__count">{geofences.length} zonas</span>
        </div>
      </header>

      <div className="geofence-sidebar-body">
        <GeofenceAppearanceForm selected={selectedGeofenceRecord} placing={placingShape !== null}
          onApply={onApplyAppearance} onStart={onStartPlacement} />
        {geofences.length > 0 && (
          <div className="geofence-panel__list" role="list">
            {geofences.map((item) => (
              <button
                key={item.id}
                type="button"
                role="listitem"
                className={item.id === selectedGeofenceId ? 'is-active' : ''}
                style={{ borderLeft: `4px solid ${geofenceAppearance(item).color}` }}
                onClick={() => onSelectGeofenceId(item.id)}
              >
                <i
                  className={
                    item.geometry.shape === 'circle'
                      ? 'pi pi-circle'
                      : 'pi pi-map'
                  }
                  aria-hidden="true"
                />
                <span style={{ textAlign: 'left' }}>
                  {item.name}
                  {item.sedeNombre && (
                    <small
                      style={{
                        display: 'block',
                        fontSize: '0.68rem',
                        opacity: 0.75,
                        fontWeight: 400,
                      }}
                    >
                      {item.sedeNombre}
                    </small>
                  )}
                </span>
              </button>
            ))}
          </div>
        )}

        {placingShape && (
          <div className="status-banner status-banner--warning" style={{ marginBottom: '0.75rem' }}>
            <i className={placingShape === 'circle' ? 'pi pi-circle' : 'pi pi-pencil'} aria-hidden="true" />
            <span>
              {placingShape === 'circle'
                ? 'Trazando círculo: haz clic en el mapa para el centro.'
                : 'Trazando polígono: haz clic para agregar vértices.'}
            </span>
          </div>
        )}

        {geofence ? (
          <>
            {geofence.shape === 'circle' && (
              <label className="geofence-panel__field" htmlFor="geofence-radius">
                <span>Radio</span>
                <InputNumber
                  inputId="geofence-radius"
                  value={Math.round(geofence.radius)}
                  min={MIN_GEOFENCE_RADIUS}
                  max={MAX_GEOFENCE_RADIUS}
                  step={50}
                  suffix=" m"
                  showButtons
                  buttonLayout="horizontal"
                  incrementButtonIcon="pi pi-plus"
                  decrementButtonIcon="pi pi-minus"
                  onValueChange={(event) => onGeofenceRadiusChange(event.value ?? null)}
                />
              </label>
            )}

            <dl className="geofence-panel__stats">
              <div>
                <dt>En esta zona</dt>
                <dd>
                  {unitsInsideGeofence}
                  <small> / {totalUnits}</small>
                </dd>
              </div>
              {selectedGeofenceRecord?.sedeNombre && (
                <div>
                  <dt>Total en sede</dt>
                  <dd>
                    {unitsInsideSede}
                    <small> / {totalUnits}</small>
                  </dd>
                </div>
              )}
              <div>
                {geofence.shape === 'circle' ? (
                  <>
                    <dt>Centro</dt>
                    <dd>
                      {geofence.latitude.toFixed(5)}, {geofence.longitude.toFixed(5)}
                    </dd>
                  </>
                ) : (
                  <>
                    <dt>Área</dt>
                    <dd>{formatArea(geofenceArea)}</dd>
                  </>
                )}
              </div>
            </dl>

            {geofence.shape === 'polygon' && (
              <p className="geofence-panel__meta">
                {geofence.vertices.length} vértices en polígono
              </p>
            )}

            <p className="geofence-panel__tip">
              {geofence.shape === 'circle'
                ? 'Arrastra el punto central para mover la geocerca o el borde para ajustar el radio.'
                : 'Arrastra los vértices azules para cambiar la forma. Usa los puntos intermedios para agregar vértices.'}
            </p>

            <div className="geofence-panel__actions">
              <Button
                label="Eliminar seleccionada"
                icon="pi pi-trash"
                size="small"
                text
                severity="danger"
                onClick={onClearGeofence}
              />
            </div>
          </>
        ) : (
          <p className="geofence-panel__tip">
            Elige el tipo de área para saber qué unidades se encuentran dentro.
          </p>
        )}

      </div>
    </section>
  );
}

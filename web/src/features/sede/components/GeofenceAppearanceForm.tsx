import { Button } from 'primereact/button';
import { ColorPicker } from 'primereact/colorpicker';
import { Dropdown } from 'primereact/dropdown';
import { InputText } from 'primereact/inputtext';
import { SelectButton } from 'primereact/selectbutton';
import { useGeofenceAppearance } from '../hooks/useGeofenceAppearance';
import { validGeofenceColor } from '../utils/geofence-appearance.utils';
import type { GeofenceAppearance, GeofencePurpose, GeofenceRecord, GeofenceShape } from '../types/geofence.types';
import { GEOFENCE_PURPOSE_OPTIONS } from '../config/geofence.config';

interface Props {
  selected: GeofenceRecord | null; placing: boolean;
  onApply: (value: GeofenceAppearance) => void;
  onStart: (shape: GeofenceShape, value: GeofenceAppearance) => void;
}
export function GeofenceAppearanceForm({ selected, placing, onApply, onStart }: Props) {
  const form = useGeofenceAppearance(selected);
  const valid = !!form.value.name.trim() && validGeofenceColor(form.value.color);
  return <section className="geofence-appearance" aria-label="Nombre y color de geocerca">
    <SelectButton value={form.mode} allowEmpty={false} disabled={placing}
      options={[{ label: 'Nueva zona', value: 'new' }, { label: 'Editar seleccionada', value: 'edit', disabled: !selected }]}
      onChange={event => form.setMode(event.value as 'new' | 'edit')} />
    <label htmlFor="geofence-name">Nombre del cliente o zona
      <InputText id="geofence-name" value={form.value.name} maxLength={120} disabled={placing}
        onChange={event => form.update({ name: event.target.value })} placeholder="Ej. Cliente Los Olivos" /></label>
    <div className="geofence-appearance__row">
      <label htmlFor="geofence-purpose">Tipo de zona
        <Dropdown inputId="geofence-purpose" value={form.value.purpose} options={GEOFENCE_PURPOSE_OPTIONS}
          disabled={placing || (form.mode === 'edit' && !!selected?.sedeNombre)}
          onChange={event => form.changePurpose(event.value as GeofencePurpose)} /></label>
      <label htmlFor="geofence-color">Color
        <div className="geofence-appearance__color"><ColorPicker inputId="geofence-color" format="hex"
          value={form.value.color.slice(1)} disabled={placing}
          onChange={event => { if (typeof event.value === 'string') form.update({ color: `#${event.value}` }); }} />
          <span>{form.value.color.toUpperCase()}</span></div></label>
    </div>
    {form.mode === 'edit' ? <Button label="Guardar nombre y color" icon="pi pi-check" size="small" disabled={!valid || !selected || placing}
      onClick={() => onApply(form.value)} /> : <div className="geofence-panel__shape-actions">
      <Button label="Nuevo círculo" icon="pi pi-circle" size="small" outlined disabled={!valid || placing}
        onClick={() => onStart('circle', form.value)} />
      <Button label="Nuevo polígono" icon="pi pi-pencil" size="small" outlined disabled={!valid || placing}
        onClick={() => onStart('polygon', form.value)} />
    </div>}
    <small>Las zonas y sus colores se guardan en este navegador.</small>
  </section>;
}

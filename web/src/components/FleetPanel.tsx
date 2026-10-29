import { useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Column } from 'primereact/column';
import { DataTable } from 'primereact/datatable';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';
import { Tag } from 'primereact/tag';

import type { FleetFilter, FleetUnit } from '../types/fleet';

interface FleetPanelProps {
  units: FleetUnit[];
  loading: boolean;
  onFocus: (unit: FleetUnit) => void;
}

const FILTER_OPTIONS: Array<{ label: string; value: FleetFilter }> = [
  { label: 'Todas', value: 'all' },
  { label: 'En movimiento', value: 'moving' },
  { label: 'Detenidas', value: 'stopped' },
];

export function FleetPanel({ units, loading, onFocus }: FleetPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FleetFilter>('all');

  const filteredUnits = useMemo(() => {
    const term = search.trim().toLowerCase();

    return units.filter((unit) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'moving' ? unit.velocidad > 0 : unit.velocidad === 0);

      const matchesSearch =
        term.length === 0 ||
        unit.placa.toLowerCase().includes(term) ||
        (unit.cliente?.toLowerCase().includes(term) ?? false) ||
        unit.idUnidad.toLowerCase().includes(term);

      return matchesFilter && matchesSearch;
    });
  }, [units, search, filter]);

  const unitBody = (unit: FleetUnit) => (
    <div className="unit-cell">
      <span className="unit-cell__plate">{unit.placa}</span>
      {unit.cliente && (
        <span className="unit-cell__client" title={unit.cliente}>
          {unit.cliente}
        </span>
      )}
    </div>
  );

  const statusBody = (unit: FleetUnit) => (
    <Tag
      value={unit.estadoMotor}
      severity={unit.motorEncendido ? 'success' : undefined}
      className={`unit-tag${unit.motorEncendido ? '' : ' unit-tag--off'}`}
      rounded
    />
  );

  const speedBody = (unit: FleetUnit) => (
    <span className={`speed${unit.velocidad > 0 ? ' speed--moving' : ''}`}>
      {unit.velocidad}
      <small>km/h</small>
    </span>
  );

  const actionBody = (unit: FleetUnit) => (
    <Button
      icon="pi pi-bullseye"
      className="unit-action"
      rounded
      text
      severity="info"
      aria-label={`Centrar ${unit.placa} en el mapa`}
      onClick={(event) => {
        event.stopPropagation();
        onFocus(unit);
      }}
    />
  );

  return (
    <section className="fleet-panel">
      <header className="fleet-panel__head">
        <div className="fleet-panel__heading">
          <h2>Unidades asignadas</h2>
          <span className="fleet-panel__count" aria-live="polite">
            {filteredUnits.length} de {units.length}
          </span>
        </div>

        <div className="fleet-panel__filters">
          <IconField className="fleet-panel__search">
            <InputIcon className="pi pi-search" />
            <InputText
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar placa o cliente"
              aria-label="Buscar unidad por placa o cliente"
            />
          </IconField>

          <Dropdown
            value={filter}
            options={FILTER_OPTIONS}
            onChange={(event) => setFilter(event.value as FleetFilter)}
            aria-label="Filtrar unidades por estado"
            className="fleet-panel__filter"
          />
        </div>
      </header>

      <DataTable
        className="fleet-panel__table"
        value={filteredUnits}
        dataKey="idUnidad"
        loading={loading}
        size="small"
        scrollable
        scrollHeight="flex"
        emptyMessage="No hay unidades que coincidan con el filtro."
        rowHover
        onRowClick={(event) => onFocus(event.data as FleetUnit)}
      >
        <Column header="Unidad" body={unitBody} />
        <Column
          header="Estado"
          body={statusBody}
          style={{ width: '6.6rem' }}
        />
        <Column
          header="Vel."
          body={speedBody}
          style={{ width: '4.2rem' }}
        />
        <Column body={actionBody} style={{ width: '2.6rem' }} />
      </DataTable>
    </section>
  );
}

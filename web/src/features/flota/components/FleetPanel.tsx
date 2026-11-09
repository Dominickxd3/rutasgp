import { useMemo, useState } from 'react';
import { Button } from 'primereact/button';
import { Dropdown } from 'primereact/dropdown';
import { IconField } from 'primereact/iconfield';
import { InputIcon } from 'primereact/inputicon';
import { InputText } from 'primereact/inputtext';

import type { FleetFilter, FleetUnit } from '../types/fleet.types';

interface FleetPanelProps {
  units: FleetUnit[];
  loading: boolean;
  onFocus: (unit: FleetUnit) => void;
  selectedUnitId?: string;
  onRefresh?: () => void;
}

export function FleetPanel({
  units,
  loading,
  onFocus,
  selectedUnitId,
  onRefresh,
}: FleetPanelProps) {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FleetFilter>('all');
  const [selectedClient, setSelectedClient] = useState<string>('all');

  // Compute counts
  const totalCount = units.length;
  const movingCount = useMemo(
    () => units.filter((u) => u.velocidad > 0).length,
    [units],
  );
  const stoppedCount = useMemo(
    () => units.filter((u) => u.velocidad === 0).length,
    [units],
  );

  // Distinct clients for dropdown
  const clientOptions = useMemo(() => {
    const clients = Array.from(
      new Set(
        units
          .map((u) => u.cliente?.trim())
          .filter((c): c is string => Boolean(c && c.length > 0)),
      ),
    ).sort();

    return [
      { label: 'Todos los clientes', value: 'all' },
      ...clients.map((c) => ({ label: c, value: c })),
    ];
  }, [units]);

  // Filtered units
  const filteredUnits = useMemo(() => {
    const term = search.trim().toLowerCase();

    return units.filter((unit) => {
      // Status filter
      const matchesStatus =
        filter === 'all' ||
        (filter === 'moving' ? unit.velocidad > 0 : unit.velocidad === 0);

      // Client filter
      const matchesClient =
        selectedClient === 'all' ||
        unit.cliente?.toLowerCase() === selectedClient.toLowerCase();

      // Search term
      const matchesSearch =
        term.length === 0 ||
        unit.placa.toLowerCase().includes(term) ||
        (unit.cliente?.toLowerCase().includes(term) ?? false) ||
        unit.idUnidad.toLowerCase().includes(term);

      return matchesStatus && matchesClient && matchesSearch;
    });
  }, [units, search, filter, selectedClient]);

  const formatUnitStatus = (unit: FleetUnit) => {
    if (unit.velocidad > 0) {
      return 'En circulación';
    }
    if (unit.motorEncendido) {
      return 'Ralentí (0 km/h)';
    }
    return 'Detenida';
  };

  return (
    <section className="fleet-panel">
      {/* Header */}
      <header className="fleet-panel__head">
        <div className="fleet-panel__title-row">
          <div>
            <h2 className="fleet-panel__title">Directorio de Flota</h2>
            <p className="fleet-panel__subtitle">
              Lima Metropolitana • Tiempo real
            </p>
          </div>
          {onRefresh && (
            <Button
              icon="pi pi-refresh"
              rounded
              text
              severity="secondary"
              aria-label="Actualizar datos de flota"
              className={`fleet-panel__refresh-btn ${loading ? 'is-spinning' : ''}`}
              onClick={onRefresh}
            />
          )}
        </div>

        {/* Search */}
        <div className="fleet-panel__search-row">
          <IconField className="fleet-panel__search">
            <InputIcon className="pi pi-search" />
            <InputText
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filtrar por placa, vía o cliente..."
              aria-label="Filtrar por placa, vía o cliente"
            />
          </IconField>
        </div>

        {/* Segmented Filter Pills */}
        <div className="fleet-panel__tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'all'}
            className={`fleet-tab ${filter === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilter('all')}
          >
            Todas <span className="fleet-tab__count">{totalCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'moving'}
            className={`fleet-tab ${filter === 'moving' ? 'is-active' : ''}`}
            onClick={() => setFilter('moving')}
          >
            En ruta <span className="fleet-tab__count">{movingCount}</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={filter === 'stopped'}
            className={`fleet-tab ${filter === 'stopped' ? 'is-active' : ''}`}
            onClick={() => setFilter('stopped')}
          >
            Paradas <span className="fleet-tab__count">{stoppedCount}</span>
          </button>
        </div>

        {/* Subheader: counts & client dropdown */}
        <div className="fleet-panel__subbar">
          <span className="fleet-panel__units-count">
            {filteredUnits.length} de {totalCount} unidades
          </span>
          {clientOptions.length > 2 && (
            <Dropdown
              value={selectedClient}
              options={clientOptions}
              onChange={(e) => setSelectedClient(e.value as string)}
              className="fleet-panel__client-dropdown"
              aria-label="Filtrar por cliente"
            />
          )}
        </div>
      </header>

      {/* Units List */}
      <div className="fleet-panel__list" role="list">
        {loading && filteredUnits.length === 0 ? (
          <div className="fleet-panel__loading">
            <i className="pi pi-spin pi-spinner" aria-hidden="true" />
            <span>Cargando unidades...</span>
          </div>
        ) : filteredUnits.length === 0 ? (
          <div className="fleet-panel__empty">
            <i className="pi pi-info-circle" aria-hidden="true" />
            <span>No se encontraron unidades que coincidan.</span>
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const isSelected = unit.idUnidad === selectedUnitId;
            const isMoving = unit.velocidad > 0;

            return (
              <div
                key={unit.idUnidad}
                role="listitem"
                className={`fleet-item ${isSelected ? 'is-selected' : ''}`}
                onClick={() => onFocus(unit)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onFocus(unit);
                  }
                }}
              >
                <div className="fleet-item__main">
                  <div className="fleet-item__info">
                    <span className="fleet-item__plate">{unit.placa}</span>
                    {unit.cliente && (
                      <span className="fleet-item__client" title={unit.cliente}>
                        {unit.cliente}
                      </span>
                    )}
                  </div>
                  <div
                    className={`fleet-item__speed ${isMoving ? 'is-moving' : 'is-stopped'}`}
                  >
                    <span>{unit.velocidad}</span>
                    <small>km/h</small>
                  </div>
                </div>

                <div className="fleet-item__sub">
                  <span className="fleet-item__status">
                    {formatUnitStatus(unit)}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}

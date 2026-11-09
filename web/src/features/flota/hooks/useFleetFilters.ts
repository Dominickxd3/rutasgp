import { useMemo, useState } from 'react';
import type { FleetFilter, FleetUnit } from '../types/fleet.types';

export function useFleetFilters(units: FleetUnit[]) {
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

  return { search, setSearch, filter, setFilter, filteredUnits };
}

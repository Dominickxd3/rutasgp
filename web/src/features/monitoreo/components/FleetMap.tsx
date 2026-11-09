import { forwardRef } from 'react';
import { useFleetMap } from '../map/useFleetMap';
import type { FleetMapHandle, FleetMapProps } from '../map/map.types';
export type { FleetMapHandle } from '../map/map.types';
export const FleetMap = forwardRef<FleetMapHandle, FleetMapProps>(
  function FleetMap(props, ref) {
    const containerRef = useFleetMap(props, ref);
    return (
      <div
        className="fleet-map"
        ref={containerRef}
        aria-label="Mapa de posiciones de la flota"
      />
    );
  },
);

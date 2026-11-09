import type { VehicleKind, UnitFeatureProperties } from './map.types';
import type { FeatureCollection, Point } from 'geojson';
import { escapeHtml, formatNumber, formatUnitDate } from '../../../lib/format';
import type { FleetUnit } from '../../flota/types/fleet.types';
import { CAR_PLATES } from './map.config';
export function vehicleKind(unit: FleetUnit): VehicleKind {
  const normalizedPlate = unit.placa.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return CAR_PLATES.has(normalizedPlate) ? 'car' : 'truck';
}
export function buildPopupHtml(unit: FleetUnit): string {
  const statusClass = unit.motorEncendido ? 'is-on' : 'is-off';
  const battery =
    unit.bateria === null ? '—' : `${formatNumber(unit.bateria)} V`;
  const mileage =
    unit.kilometraje === null ? '—' : `${formatNumber(unit.kilometraje, 0)} km`;
  const client = unit.cliente
    ? `<p class="unit-popup__client">${escapeHtml(unit.cliente)}</p>`
    : '';
  return `
    <article class="unit-popup">
      <header class="unit-popup__head">
        <span class="unit-popup__plate">${escapeHtml(unit.placa)}</span>
        <span class="unit-popup__status ${statusClass}">${escapeHtml(unit.estadoMotor)}</span>
      </header>
      ${client}
      <dl class="unit-popup__grid">
        <div><dt>Velocidad</dt><dd>${unit.velocidad} km/h</dd></div>
        <div><dt>Batería</dt><dd>${battery}</dd></div>
        <div><dt>Kilometraje</dt><dd>${mileage}</dd></div>
        <div><dt>Última señal</dt><dd>${escapeHtml(formatUnitDate(unit.fecha))}</dd></div>
      </dl>
      <footer class="unit-popup__footer">
        <span>${unit.latitud.toFixed(5)}, ${unit.longitud.toFixed(5)}</span>
        <span>ID ${escapeHtml(unit.idUnidad)}</span>
      </footer>
    </article>
  `;
}
export function buildFeatureCollection(
  units: FleetUnit[],
): FeatureCollection<Point, UnitFeatureProperties> {
  return {
    type: 'FeatureCollection',
    features: units.map((unit) => ({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [unit.longitud, unit.latitud],
      },
      properties: {
        idUnidad: unit.idUnidad,
        placa: unit.placa,
        icon: `fleet-${vehicleKind(unit)}-${unit.velocidad > 0 ? 'moving' : 'stopped'}`,
        moving: unit.velocidad > 0 ? 1 : 0,
      },
    })),
  };
}

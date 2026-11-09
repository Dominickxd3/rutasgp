import type { Shipment, ShipmentVehicleGroup } from '../types/shipment.types';

export function displayCommercialAssignment(assignment: { code: string | null; name: string | null } | undefined): string {
  if (!assignment?.code && !assignment?.name) return 'Sin asignación informada';
  return [assignment.code, assignment.name ?? 'Sin descripción en catálogo'].filter(Boolean).join(' · ');
}

export function limaToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function displayDate(value: string | null): string {
  return value ? value.split('-').reverse().join('/') : 'Sin fecha';
}
export function displayTime(value: string | null): string {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Sin consulta';
  return new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value));
}
export function displayNumber(value: number | null): string {
  return value === null ? '—' : new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value);
}
export function groupByTruck(items: Shipment[]): ShipmentVehicleGroup[] {
  const groups = new Map<string, ShipmentVehicleGroup>();
  for (const item of items) {
    const key = item.vehicle.localId !== null ? `gps:${item.vehicle.localId}`
      : `erp:${item.vehicle.erpId ?? ''}:${item.vehicle.erpPlate ?? ''}:${item.vehicle.match}`;
    const group = groups.get(key) ?? { key, vehicle: item.vehicle, items: [], clients: 0 };
    group.items.push(item);
    groups.set(key, group);
  }
  for (const group of groups.values()) group.clients = new Set(group.items.map(item => item.customer.id).filter(id => id !== null)).size;
  return [...groups.values()].sort((a,b) => Number(b.vehicle.localId !== null)-Number(a.vehicle.localId !== null)
    || (a.vehicle.plate ?? a.vehicle.erpPlate ?? '').localeCompare(b.vehicle.plate ?? b.vehicle.erpPlate ?? ''));
}

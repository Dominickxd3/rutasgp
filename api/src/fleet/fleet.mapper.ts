import { FleetUnit, RawFleetUnit } from './interfaces/fleet.interface';

function toText(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();

    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim().replace(',', '.');

  if (normalized.length === 0) {
    return null;
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed) ? parsed : null;
}

function isInsideRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

function mapUnit(
  raw: RawFleetUnit,
  clientByUnit: ReadonlyMap<string, string>,
): FleetUnit | null {
  const idUnidad =
    toText(raw.id_unidad) ?? toText(raw.id_data) ?? toText(raw.modulo);

  const latitud = toNumber(raw.latitud);
  const longitud = toNumber(raw.longitud);

  if (!idUnidad || latitud === null || longitud === null) {
    return null;
  }

  if (!isInsideRange(latitud, -90, 90) || !isInsideRange(longitud, -180, 180)) {
    return null;
  }

  if (latitud === 0 && longitud === 0) {
    return null;
  }

  const estadoMotor = toText(raw.estado_motor) ?? 'Sin dato';
  const estadoNormalizado = estadoMotor.toLowerCase();
  const velocidad = Math.max(0, Math.round(toNumber(raw.speed) ?? 0));
  const orientacion = toNumber(raw.orientacion) ?? 0;

  return {
    idUnidad,
    placa: toText(raw.placa) ?? `Unidad ${idUnidad}`,
    cliente: toText(raw.cliente) ?? clientByUnit.get(idUnidad) ?? null,
    estadoMotor,
    motorEncendido:
      estadoNormalizado.includes('encend') ||
      estadoNormalizado.includes('activo') ||
      estadoNormalizado === 'on',
    velocidad,
    latitud,
    longitud,
    orientacion: ((orientacion % 360) + 360) % 360,
    bateria: toNumber(raw.bateria),
    kilometraje: toNumber(raw.kilometraje),
    fecha: toText(raw.fecha),
    modulo: toText(raw.modulo),
  };
}

export function normalizeFleet(
  rawUnits: RawFleetUnit[],
  clientByUnit: ReadonlyMap<string, string> = new Map(),
): FleetUnit[] {
  const byUnitId = new Map<string, FleetUnit>();

  for (const raw of rawUnits) {
    const unit = mapUnit(raw, clientByUnit);

    if (!unit) {
      continue;
    }

    // El proveedor puede repetir una unidad: nos quedamos con la última lectura.
    byUnitId.set(unit.idUnidad, unit);
  }

  return [...byUnitId.values()].sort((a, b) =>
    a.placa.localeCompare(b.placa, 'es', { numeric: true }),
  );
}

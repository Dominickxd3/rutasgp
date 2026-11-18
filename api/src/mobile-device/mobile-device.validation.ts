import { BadRequestException } from '@nestjs/common';

import {
  MOBILE_EVENT_TYPES,
  MOBILE_STOP_TYPES,
  type MobileEvent,
  type MobileEventBatch,
  type MobileEventType,
  type MobileStopType,
} from './mobile-device.types';

const DEVICE_ID = /^[A-Za-z0-9._-]{3,128}$/;
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const MAX_AGE_MS = 31 * 24 * 60 * 60 * 1_000;
const MAX_FUTURE_MS = 10 * 60 * 1_000;

export function parseDeviceId(value: unknown): string {
  const deviceId = typeof value === 'string' ? value.trim() : '';
  if (!DEVICE_ID.test(deviceId)) throw new BadRequestException('deviceId no es válido.');
  return deviceId;
}

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${name} debe ser numérico.`);
  }
  return value;
}

function optionalNumber(value: unknown, name: string): number | null {
  return value === undefined || value === null ? null : finite(value, name);
}

function optionalInteger(value: unknown, name: string): number | null {
  const number = optionalNumber(value, name);
  if (number !== null && (!Number.isSafeInteger(number) || number < 0)) {
    throw new BadRequestException(`${name} debe ser un entero positivo.`);
  }
  return number;
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length === 0 ? null : text.slice(0, max);
}

function timestamp(value: unknown, name: string, now: number): number {
  const ms = finite(value, name);
  if (ms < now - MAX_AGE_MS || ms > now + MAX_FUTURE_MS) {
    throw new BadRequestException(`${name} está fuera del intervalo permitido.`);
  }
  return ms;
}

function event(value: unknown, index: number, now: number): MobileEvent {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(`events[${index}] no es válido.`);
  }
  const raw = value as Record<string, unknown>;
  const name = `events[${index}]`;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!UUID.test(id)) throw new BadRequestException(`${name}.id debe ser un UUID.`);

  const type = raw.type as MobileEventType;
  if (!MOBILE_EVENT_TYPES.includes(type)) throw new BadRequestException(`${name}.type no es válido.`);

  const latitude = finite(raw.latitude, `${name}.latitude`);
  const longitude = finite(raw.longitude, `${name}.longitude`);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
    throw new BadRequestException(`${name} contiene coordenadas fuera de rango.`);
  }

  let stopType: MobileStopType | null = null;
  if (raw.stopType !== undefined && raw.stopType !== null) {
    stopType = raw.stopType as MobileStopType;
    if (!MOBILE_STOP_TYPES.includes(stopType)) throw new BadRequestException(`${name}.stopType no es válido.`);
  }
  if (type === 'STOP_END' && stopType === null) {
    throw new BadRequestException(`${name}.stopType es obligatorio en STOP_END.`);
  }

  const durationSeconds = optionalInteger(raw.durationSeconds, `${name}.durationSeconds`);
  if (durationSeconds !== null && durationSeconds > 7 * 24 * 60 * 60) {
    throw new BadRequestException(`${name}.durationSeconds está fuera de rango.`);
  }

  return {
    id: id.toLowerCase(),
    type,
    timestamp: timestamp(raw.timestamp, `${name}.timestamp`, now),
    latitude,
    longitude,
    recordedOffline: raw.recordedOffline === true,
    stopType,
    startTimestamp: raw.startTimestamp == null ? null : timestamp(raw.startTimestamp, `${name}.startTimestamp`, now),
    endTimestamp: raw.endTimestamp == null ? null : timestamp(raw.endTimestamp, `${name}.endTimestamp`, now),
    durationSeconds,
    routeId: optionalInteger(raw.routeId, `${name}.routeId`),
    routeStopId: optionalInteger(raw.routeStopId, `${name}.routeStopId`),
    geofenceId: optionalText(raw.geofenceId, 64),
    geofenceType: optionalText(raw.geofenceType, 20),
    placeName: optionalText(raw.placeName, 150),
  };
}

export function parseMobileEventBatch(value: unknown, now: number = Date.now()): MobileEventBatch {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('El cuerpo JSON no es válido.');
  }
  const raw = value as Record<string, unknown>;
  const providerUnitId = finite(raw.providerUnitId, 'providerUnitId');
  if (!Number.isSafeInteger(providerUnitId) || providerUnitId < 1) {
    throw new BadRequestException('providerUnitId debe ser un entero positivo.');
  }
  const plate = typeof raw.plate === 'string' ? raw.plate.trim().toUpperCase() : '';
  if (!/^[A-Z0-9 -]{1,15}$/.test(plate)) throw new BadRequestException('plate no es válida.');
  if (!Array.isArray(raw.events) || raw.events.length < 1 || raw.events.length > 200) {
    throw new BadRequestException('events debe contener entre 1 y 200 eventos.');
  }
  return {
    deviceId: parseDeviceId(raw.deviceId),
    providerUnitId,
    plate,
    events: raw.events.map((item, index) => event(item, index, now)),
  };
}

/** Cuerpo de PUT /api/mobile/devices/:deviceId/vehicle → { vehicleId: number | null }. */
export function parseVehicleAssignment(value: unknown): { vehicleId: number | null; assignedBy: string | null } {
  if (!value || typeof value !== 'object') throw new BadRequestException('El cuerpo JSON no es válido.');
  const raw = value as Record<string, unknown>;
  const vehicleId = raw.vehicleId === null ? null : finite(raw.vehicleId, 'vehicleId');
  if (vehicleId !== null && (!Number.isSafeInteger(vehicleId) || vehicleId < 1)) {
    throw new BadRequestException('vehicleId debe ser un entero positivo o null.');
  }
  return { vehicleId, assignedBy: optionalText(raw.assignedBy, 50) };
}

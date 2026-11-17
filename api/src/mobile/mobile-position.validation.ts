import { BadRequestException } from '@nestjs/common';

import type {
  MobilePositionBatch,
  MobilePositionPoint,
} from './mobile-position.types';

function finite(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new BadRequestException(`${name} debe ser numérico.`);
  }
  return value;
}

function point(value: unknown, index: number): MobilePositionPoint {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException(`points[${index}] no es válido.`);
  }
  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'string' ? raw.id.trim() : '';
  if (!/^[A-Za-z0-9-]{1,64}$/.test(id)) {
    throw new BadRequestException(`points[${index}].id no es válido.`);
  }
  const latitude = finite(raw.latitude, `points[${index}].latitude`);
  const longitude = finite(raw.longitude, `points[${index}].longitude`);
  const accuracyMeters = finite(raw.accuracyMeters, `points[${index}].accuracyMeters`);
  const gpsTimestamp = finite(raw.gpsTimestamp, `points[${index}].gpsTimestamp`);
  const recordedTimestamp = finite(raw.recordedTimestamp, `points[${index}].recordedTimestamp`);
  const speedMetersPerSecond = raw.speedMetersPerSecond === null
    ? null
    : finite(raw.speedMetersPerSecond, `points[${index}].speedMetersPerSecond`);

  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || (latitude === 0 && longitude === 0)) {
    throw new BadRequestException(`points[${index}] contiene coordenadas fuera de rango.`);
  }
  if (accuracyMeters < 0 || accuracyMeters > 10_000) {
    throw new BadRequestException(`points[${index}].accuracyMeters está fuera de rango.`);
  }
  if (speedMetersPerSecond !== null && (speedMetersPerSecond < 0 || speedMetersPerSecond > 200)) {
    throw new BadRequestException(`points[${index}].speedMetersPerSecond está fuera de rango.`);
  }
  const now = Date.now();
  if (gpsTimestamp < now - 31 * 24 * 60 * 60 * 1_000 || gpsTimestamp > now + 10 * 60 * 1_000) {
    throw new BadRequestException(`points[${index}].gpsTimestamp está fuera del intervalo permitido.`);
  }

  return {
    id,
    latitude,
    longitude,
    accuracyMeters,
    speedMetersPerSecond,
    gpsTimestamp,
    recordedTimestamp,
    mock: raw.mock === true,
  };
}

export function parseMobilePositionBatch(value: unknown): MobilePositionBatch {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('El cuerpo JSON no es válido.');
  }
  const raw = value as Record<string, unknown>;
  const deviceId = typeof raw.deviceId === 'string' ? raw.deviceId.trim() : '';
  const plate = typeof raw.plate === 'string' ? raw.plate.trim().toUpperCase() : '';
  const providerUnitId = finite(raw.providerUnitId, 'providerUnitId');
  if (!/^[A-Za-z0-9._-]{3,128}$/.test(deviceId)) {
    throw new BadRequestException('deviceId no es válido.');
  }
  if (!Number.isSafeInteger(providerUnitId) || providerUnitId < 1) {
    throw new BadRequestException('providerUnitId debe ser un entero positivo.');
  }
  if (!/^[A-Z0-9 -]{1,15}$/.test(plate)) {
    throw new BadRequestException('plate no es váida.');
  }
  if (!Array.isArray(raw.points) || raw.points.length < 1 || raw.points.length > 100) {
    throw new BadRequestException('points debe contener entre 1 y 100 posiciones.');
  }
  return {
    deviceId,
    providerUnitId,
    plate,
    points: raw.points.map(point),
  };
}

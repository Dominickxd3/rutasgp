import { BadRequestException } from '@nestjs/common';

import type { MobileLoginInput } from './mobile-auth.types';

export function parseMobileLogin(value: unknown): MobileLoginInput {
  if (!value || typeof value !== 'object') {
    throw new BadRequestException('El cuerpo JSON no es válido.');
  }

  const raw = value as Record<string, unknown>;
  const username =
    typeof raw.username === 'string' ? raw.username.trim() : '';
  const password = typeof raw.password === 'string' ? raw.password : '';
  const deviceId =
    typeof raw.deviceId === 'string' && raw.deviceId.trim().length > 0
      ? raw.deviceId.trim()
      : null;

  if (!/^[A-Za-z0-9._-]{1,50}$/.test(username)) {
    throw new BadRequestException('Usuario no válido.');
  }

  if (password.length < 1 || password.length > 100) {
    throw new BadRequestException('Contraseña no válida.');
  }

  if (deviceId !== null && !/^[A-Za-z0-9._-]{3,128}$/.test(deviceId)) {
    throw new BadRequestException('deviceId no es válido.');
  }

  return { username, password, deviceId };
}

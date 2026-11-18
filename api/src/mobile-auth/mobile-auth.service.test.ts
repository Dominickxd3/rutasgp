import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { DatabaseService } from '../database/database.service';
import { MobileAuthService } from './mobile-auth.service';

function service(secret: string, onDatabase: () => void) {
  const config = { get: (key: string, fallback?: unknown) => (key === 'auth.secret' ? secret : fallback) };
  const database = { get pool() { onDatabase(); return Promise.reject(new Error('sin BD en la prueba')); } };
  return new MobileAuthService(database as unknown as DatabaseService, config as unknown as ConfigService);
}

test('sin AUTH_SECRET el login móvil responde 503 y no consulta usuarios', async () => {
  let consultoBd = false;
  await assert.rejects(
    service('  ', () => { consultoBd = true; }).login({ username: 'admin', password: 'x', deviceId: null }),
    (error: unknown) => error instanceof ServiceUnavailableException && /AUTH_SECRET/.test(error.message),
  );
  assert.equal(consultoBd, false);
});

test('con AUTH_SECRET el login continúa hacia la base de datos', async () => {
  let consultoBd = false;
  await assert.rejects(
    service('secreto-de-prueba', () => { consultoBd = true; }).login({ username: 'admin', password: 'x', deviceId: null }),
    /sin BD en la prueba/,
  );
  assert.equal(consultoBd, true);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { DatabaseService } from '../database/database.service';
import { signMobileToken, verifyMobileToken } from '../common/auth/mobile-token';
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

function refreshService(rows: Array<{ userActive: number; deviceBlocked: number }>, onDatabase: () => void) {
  const values: Record<string, unknown> = { 'auth.secret': 'secreto', 'auth.refreshGraceDays': 90, 'auth.tokenTtlHours': 720 };
  const config = { get: (key: string, fallback?: unknown) => (key in values ? values[key] : fallback) };
  const request = { input() { return request; }, query: async () => ({ recordset: rows }) };
  const database = { get pool() { onDatabase(); return Promise.resolve({ request: () => request }); } };
  return new MobileAuthService(database as unknown as DatabaseService, config as unknown as ConfigService);
}

const day = 24 * 60 * 60 * 1_000;

test('refresh rechaza tokens con firma inválida', async () => {
  const token = signMobileToken({ sub: 'dortiz', name: 'D', deviceId: 'abc123', exp: Date.now() + day }, 'otro-secreto');
  await assert.rejects(refreshService([], () => undefined).refresh(token), /Token inválido/);
});

test('refresh rechaza tokens vencidos hace más del plazo sin consultar la BD', async () => {
  let consultoBd = false;
  const token = signMobileToken({ sub: 'dortiz', name: 'D', deviceId: 'abc123', exp: Date.now() - 91 * day }, 'secreto');
  await assert.rejects(refreshService([], () => { consultoBd = true; }).refresh(token), /demasiado tiempo/);
  assert.equal(consultoBd, false);
});

test('refresh renueva un token vencido dentro del plazo y conserva usuario y celular', async () => {
  const token = signMobileToken({ sub: 'dortiz', name: 'D', deviceId: 'abc123', exp: Date.now() - 5 * day }, 'secreto');
  const result = await refreshService([{ userActive: 1, deviceBlocked: 0 }], () => undefined).refresh(token);
  const payload = verifyMobileToken(result.token, 'secreto');
  assert.equal(payload?.sub, 'dortiz');
  assert.equal(payload?.deviceId, 'abc123');
  assert.ok(new Date(result.expiresAt).getTime() > Date.now() + 29 * day);
});

test('refresh rechaza celulares desactivados y usuarios inactivos', async () => {
  const token = signMobileToken({ sub: 'dortiz', name: 'D', deviceId: 'abc123', exp: Date.now() + day }, 'secreto');
  await assert.rejects(refreshService([{ userActive: 1, deviceBlocked: 1 }], () => undefined).refresh(token), /desactivado/);
  await assert.rejects(refreshService([{ userActive: 0, deviceBlocked: 0 }], () => undefined).refresh(token), /ya no está activo/);
});

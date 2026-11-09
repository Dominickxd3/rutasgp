import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { loadProductionEnvironment, projectRoot } from './production-env.mjs';

loadProductionEnvironment();
const port = Number(process.env.PRODUCTION_TEST_PORT || 3197);
const key = process.env.API_KEY?.trim();
if (!key) throw new Error('Defina API_KEY para la comprobacion de produccion.');
const child = spawn(process.execPath, [resolve(projectRoot, 'scripts/start-production.mjs')], {
  cwd: projectRoot, windowsHide: true,
  env: { ...process.env, HOST: '127.0.0.1', PORT: String(port), GPS_COLLECTION_ENABLED: 'false', SWAGGER_ENABLED: 'false' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output = (output + chunk).slice(-12000); });
child.stderr.on('data', chunk => { output = (output + chunk).slice(-12000); });
const exited = once(child, 'exit');
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (child.exitCode !== null) throw new Error(`El proceso termino antes de iniciar. ${output}`);
    const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(1000) }).catch(() => null);
    if (response?.ok) { ready = true; break; }
    await delay(250);
  }
  assert.ok(ready, 'El servidor no alcanzo el estado disponible.');
  for (const path of ['/', '/monitoreo/flota', '/monitoreo/recorridos', '/distribucion/pedidos']) {
    const response = await fetch(`${base}${path}`);
    assert.equal(response.status, 200, path);
    assert.match(await response.text(), /<div id="root"><\/div>/);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  const html = await (await fetch(base)).text();
  const asset = html.match(/src="(\/assets\/[^\"]+\.js)"/)?.[1];
  assert.ok(asset, 'Falta el JavaScript del frontend.');
  const javascript = await fetch(`${base}${asset}`);
  assert.equal(javascript.status, 200);
  assert.match(javascript.headers.get('cache-control'), /immutable/);
  assert.ok((await javascript.text()).includes(key), 'La clave de la web difiere del entorno de prueba.');
  assert.equal((await fetch(`${base}/api/orders/vehicles`)).status, 401);
  const vehicles = await fetch(`${base}/api/orders/vehicles`, { headers: { 'x-api-key': key } });
  assert.equal(vehicles.status, 200, 'La aplicacion no pudo consultar SQL Server.');
  assert.ok(Array.isArray(await vehicles.json()));
  assert.equal((await fetch(`${base}/api/no-existe`, { headers: { 'x-api-key': key } })).status, 404);
  assert.equal((await fetch(`${base}/assets/no-existe.js`)).status, 404);
  console.log('PASS: arranque, web compilada, rutas React, assets, autenticacion y lectura SQL Server.');
} finally {
  child.kill();
  await exited;
}

// Crea api/.env a partir de api/.env.example si todavía no existe.
// Es idempotente: nunca sobrescribe un .env existente.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, 'api', '.env');
const template = resolve(root, 'api', '.env.example');

const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 20 || (major === 20 && minor < 19)) {
  console.warn(
    `\n[setup] Node ${process.versions.node} es demasiado antiguo. ` +
      'Se requiere Node >= 20.19 (recomendado 22 LTS).\n',
  );
}

if (!existsSync(template)) {
  console.error('[setup] No se encontró api/.env.example. ¿Falta el archivo?');
  process.exit(1);
}

if (existsSync(target)) {
  console.log('[setup] api/.env ya existe; no se modifica.');
} else {
  copyFileSync(template, target);
  console.log('[setup] api/.env creado a partir de api/.env.example.');
}

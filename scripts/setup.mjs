
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const envFiles = [
  { directory: 'api', label: 'api/.env' },
  { directory: 'web', label: 'web/.env' },
];

const [major, minor] = process.versions.node.split('.').map(Number);

if (major < 20 || (major === 20 && minor < 19)) {
  console.warn(
    `\n[setup] Node ${process.versions.node} es demasiado antiguo. ` +
    'Se requiere Node >= 20.19 (recomendado 22 LTS).\n',
  );
}

for (const { directory, label } of envFiles) {
  const target = resolve(root, directory, '.env');
  const template = resolve(root, directory, '.env.example');

  if (!existsSync(template)) {
    console.error(
      `[setup] No se encontró ${directory}/.env.example. ¿Falta el archivo?`,
    );
    process.exit(1);
  }

  if (existsSync(target)) {
    console.log(`[setup] ${label} ya existe; no se modifica.`);
  } else {
    copyFileSync(template, target);
    console.log(`[setup] ${label} creado a partir de ${directory}/.env.example.`);
  }
}

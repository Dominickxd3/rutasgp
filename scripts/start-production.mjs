import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadProductionEnvironment, projectRoot } from './production-env.mjs';

try {
  loadProductionEnvironment();
  const entry = resolve(projectRoot, 'api/dist/main.js');
  if (!existsSync(entry)) throw new Error('Falta la API compilada. Ejecute npm run build:production.');
  process.chdir(resolve(projectRoot, 'api'));
  await import(pathToFileURL(entry).href);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

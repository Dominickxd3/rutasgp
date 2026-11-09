import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function loadProductionEnvironment() {
  for (const name of ['.env.production.local', '.env.production']) {
    const file = resolve(projectRoot, 'api', name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
  process.env.NODE_ENV = 'production';
  if (!process.env.API_KEY?.trim()) {
    throw new Error('Defina API_KEY en api/.env.production o en el entorno.');
  }
}

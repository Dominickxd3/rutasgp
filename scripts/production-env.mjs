import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function loadProductionEnvironment() {
  const productionFiles = ['.env.production.local', '.env.production'];
  const files = productionFiles.some(name => existsSync(resolve(projectRoot, 'api', name)))
    ? productionFiles : ['.env.local', '.env'];
  for (const name of files) {
    const file = resolve(projectRoot, 'api', name);
    if (existsSync(file)) process.loadEnvFile(file);
  }
  process.env.NODE_ENV = 'production';
  if (!process.env.API_KEY?.trim()) {
    throw new Error('Defina API_KEY en api/.env o api/.env.production, o en el entorno.');
  }
}

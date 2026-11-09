import { spawnSync } from 'node:child_process';
import { loadProductionEnvironment, projectRoot } from './production-env.mjs';

try {
  loadProductionEnvironment();
  const windows = process.platform === 'win32';
  const result = spawnSync(windows ? process.env.ComSpec || 'cmd.exe' : 'npm',
    windows ? ['/d', '/s', '/c', 'npm run build'] : ['run', 'build'], {
    cwd: projectRoot, stdio: 'inherit', windowsHide: true,
    env: { ...process.env, VITE_API_BASE_URL: '/api', VITE_API_KEY: process.env.API_KEY },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

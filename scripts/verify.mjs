// Comprueba que la API esté levantada y devolviendo datos.
// Uso:  npm run verify
//       API_BASE_URL=http://localhost:3000 npm run verify
const baseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/+$/,
  '',
);

const headers = { accept: 'application/json' };

if (process.env.API_KEY) {
  headers['x-api-key'] = process.env.API_KEY;
}

async function checkHealth() {
  const response = await fetch(`${baseUrl}/api/health`, { headers });

  if (!response.ok) {
    throw new Error(`/api/health respondió HTTP ${response.status}`);
  }

  const body = await response.json();
  console.log(`[ok] health      -> ${body.status} (uptime ${body.uptimeSeconds}s)`);
}

async function checkFleet() {
  const response = await fetch(`${baseUrl}/api/fleet/units`, { headers });

  if (response.status === 401) {
    throw new Error(
      'la API exige API key. Define API_KEY en api/.env o en el entorno.',
    );
  }

  if (!response.ok) {
    throw new Error(`/api/fleet/units respondió HTTP ${response.status}`);
  }

  const body = await response.json();
  const stale = body.stale ? ' (stale: el GPS no respondió)' : '';

  console.log(
    `[ok] fleet/units -> ${body.total} unidades, ${body.moving} en movimiento${stale}`,
  );
}

try {
  await checkHealth();
  await checkFleet();
  console.log('\nTodo correcto.');
} catch (error) {
  console.error(`\n[error] ${error instanceof Error ? error.message : error}`);
  console.error(
    `Verifica que la API esté corriendo en ${baseUrl} (npm run dev).`,
  );
  process.exit(1);
}

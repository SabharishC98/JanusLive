import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

async function main() {
  const token = process.env.FLAGSMITH_MANAGEMENT_API_KEY;
  const envId = process.env.FLAGSMITH_ENVIRONMENT_ID;
  const featureId = process.env.FLAGSMITH_FEATURE_ID;

  if (!token || !envId || !featureId) {
    console.error('ERROR: FLAGSMITH_MANAGEMENT_API_KEY, FLAGSMITH_ENVIRONMENT_ID, FLAGSMITH_FEATURE_ID must all be set');
    process.exit(1);
  }

  const url = `https://api.flagsmith.com/api/__future__/environments/${envId}/features/${featureId}/`;
  console.log(`Testing Management API (GET + no-op PATCH): ${url}`);

  try {
    const getRes = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Api-Key ${token}`,
        'Accept': 'application/json',
      },
    });

    if (!getRes.ok) {
      const text = await getRes.text();
      console.error(`ERROR: Management API GET returned ${getRes.status}: ${text}`);
      process.exit(1);
    }

    const current = await getRes.json();

    const patchRes = await fetch(url, {
      method: 'PATCH',
      headers: {
        'Authorization': `Api-Key ${token}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(current),
    });

    if (!patchRes.ok) {
      const text = await patchRes.text();
      console.error(`ERROR: Management API no-op PATCH returned ${patchRes.status}: ${text}`);
      process.exit(1);
    }

    const updated = await patchRes.json();
    console.log('PASS: Management API GET + no-op PATCH succeeded (200). Feature state:', JSON.stringify(updated));
    process.exit(0);
  } catch (err) {
    console.error('ERROR: Management API request failed:', err);
    process.exit(1);
  }
}

main();

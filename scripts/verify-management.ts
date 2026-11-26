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

  const baseUrl = (process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/')
    .replace(/\/api\/v1\/?$/, '');
  const url = `${baseUrl}/api/__future__/environments/${envId}/features/${featureId}/`;

  console.log(`Testing Management API: GET ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET', // no-op read — does not change anything
      headers: {
        'Authorization': `Token ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`ERROR: Management API returned ${response.status}: ${text}`);
      process.exit(1);
    }

    const data = await response.json();
    console.log('PASS: Management API accessible. Feature data:', JSON.stringify(data, null, 2).slice(0, 500));
    process.exit(0);
  } catch (err) {
    console.error('ERROR: Management API request failed:', err);
    process.exit(1);
  }
}

main();

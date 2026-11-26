/**
 * Helper to generate a valid 72-character Lurien API key from the Hugging Face Space.
 *
 * Usage:
 *   npx tsx scripts/create-lurien-key.ts your-email@example.com your-password
 */

import { randomUUID } from 'crypto';

async function main() {
  const email = process.argv[2] || `developer_${randomUUID().slice(0, 8)}@pwnlab.local`;
  const password = process.argv[3] || `PwnLab_${randomUUID().slice(0, 8)}!`;

  const baseUrl = 'https://imdrizzle-lurien-matrix-firewall.hf.space';
  console.log(`Connecting to Lurien Firewall at ${baseUrl}...`);

  // 1. Signup / Login
  let token: string | null = null;
  const signupRes = await fetch(`${baseUrl}/v1/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (signupRes.status === 201) {
    console.log(`✓ Created account for ${email}`);
  }

  // Login
  const loginRes = await fetch(`${baseUrl}/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!loginRes.ok) {
    const errText = await loginRes.text();
    throw new Error(`Login failed (${loginRes.status}): ${errText}`);
  }

  const loginData = (await loginRes.json()) as { access_token: string };
  token = loginData.access_token;
  console.log(`✓ Authenticated successfully`);

  // 2. Generate API Key
  const keyRes = await fetch(`${baseUrl}/v1/keys`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({ name: 'pwnlab-arena-key', app_context: 'general' }),
  });

  if (!keyRes.ok) {
    const errText = await keyRes.text();
    throw new Error(`Key creation failed (${keyRes.status}): ${errText}`);
  }

  const keyData = (await keyRes.json()) as { api_key: string };
  console.log('\n======================================================');
  console.log('✅ Generated Valid Lurien API Key:');
  console.log(keyData.api_key);
  console.log(`   Length: ${keyData.api_key.length} chars (matches fw_live_ format)`);
  console.log('======================================================');
  console.log('\nPut this into your .env.local:');
  console.log(`LURIEN_API_KEY=${keyData.api_key}\n`);
}

main().catch((err) => {
  console.error('Error creating key:', err);
  process.exit(1);
});

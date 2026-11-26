/**
 * Flagsmith Experimentation Verification Script
 * Sends one test identity through:
 * 1. 'attempt' (exposure)
 * 2. 'benign_success' (guardrail)
 * 3. 'breach' (primary metric)
 * Prints each response clearly.
 * Usage: npx tsx scripts/verify-flagsmith.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { sendEventToFlagsmith } from '../src/lib/events';
import { randomUUID } from 'crypto';

async function main() {
  console.log('=== Flagsmith Experimentation Verification ===\n');

  const testIdentityId = `test-verify-${randomUUID()}`;
  const variant = 'control'; // Option A: 2-arm trial ('control' | 'lurien')
  const envKey = process.env.FLAGSMITH_ENVIRONMENT_KEY || process.env.FLAGSMITH_CLIENT_ENV_KEY;
  const apiUrl = process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/';

  console.log(`Test Identity ID : ${testIdentityId}`);
  console.log(`Assigned Variant : ${variant}`);
  console.log(`API URL          : ${apiUrl}`);
  console.log(`Environment Key  : ${envKey ? `${envKey.slice(0, 6)}...` : '(MISSING)'}\n`);

  if (!envKey) {
    console.error('❌ Verification FAILED: Missing FLAGSMITH_ENVIRONMENT_KEY or FLAGSMITH_CLIENT_ENV_KEY in environment.');
    process.exit(1);
  }

  // Step 1: Send 'attempt' event
  console.log('[Step 1/3] Sending exposure event: attempt...');
  const attemptRes = await sendEventToFlagsmith(testIdentityId, 'attempt', variant, 0);
  console.log('Response:');
  console.dir(attemptRes, { depth: null, colors: true });
  if (!attemptRes.synced) {
    console.error(`❌ Step 1 FAILED: 'attempt' event did not sync: ${attemptRes.error}`);
    process.exit(1);
  }
  console.log('\n----------------------------------------\n');

  // Step 2: Send 'benign_success' event
  console.log('[Step 2/3] Sending guardrail event: benign_success...');
  const benignRes = await sendEventToFlagsmith(testIdentityId, 'benign_success', variant, 1);
  console.log('Response:');
  console.dir(benignRes, { depth: null, colors: true });
  if (!benignRes.synced) {
    console.error(`❌ Step 2 FAILED: 'benign_success' event did not sync: ${benignRes.error}`);
    process.exit(1);
  }
  console.log('\n----------------------------------------\n');

  // Step 3: Send 'breach' event
  console.log('[Step 3/3] Sending primary metric event: breach...');
  const breachRes = await sendEventToFlagsmith(testIdentityId, 'breach', variant, 2);
  console.log('Response:');
  console.dir(breachRes, { depth: null, colors: true });
  if (!breachRes.synced) {
    console.error(`❌ Step 3 FAILED: 'breach' event did not sync: ${breachRes.error}`);
    process.exit(1);
  }
  console.log('\n----------------------------------------\n');

  console.log('PASS: all 3 event types synced to Flagsmith');
}

main().catch((err) => {
  console.error('Verification failed:', err);
  process.exit(1);
});

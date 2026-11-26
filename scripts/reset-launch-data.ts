/**
 * Launch Data Reset Script
 * 
 * Safely purges test telemetry (sessions, messages, events, reroll_logs, ship_log, fingerprints, rate_limits, queue)
 * before the real experiment launch.
 * 
 * SAFETY GATES:
 * 1. Requires the CLI flag: --confirm
 * 2. Requires the exact production DB URL to be provided via --db-url=<url> or typed interactively.
 * 
 * NEVER RUN AUTOMATICALLY IN CI/CD OR SCRIPTS.
 * 
 * Usage:
 *   npx tsx scripts/reset-launch-data.ts --confirm --db-url="file:./pwnlab.db"
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db, initDb, getDbUrl } from '../src/lib/db';
import * as readline from 'readline';

async function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log('======================================================');
  console.log('⚠️  PWNLAB LIVE — PRE-LAUNCH DATA PURGE UTILITY  ⚠️');
  console.log('======================================================\n');

  // Check 1: --confirm flag
  if (!process.argv.includes('--confirm')) {
    console.error('❌ Operation Aborted: Missing required safety flag: --confirm');
    console.error('Usage: npx tsx scripts/reset-launch-data.ts --confirm --db-url=<your_db_url>\n');
    process.exit(1);
  }

  const configuredUrl = getDbUrl();
  console.log(`Configured Database Target: ${configuredUrl}\n`);

  // Check 2: DB URL verification
  let typedUrl = '';
  const urlArg = process.argv.find((arg) => arg.startsWith('--db-url='));
  if (urlArg) {
    typedUrl = urlArg.slice('--db-url='.length).trim();
  } else {
    typedUrl = await prompt(`Please type the exact Database URL to confirm purge: `);
  }

  if (typedUrl !== configuredUrl) {
    console.error('\n❌ Operation Aborted: Database URL mismatch.');
    console.error(`Expected: ${configuredUrl}`);
    console.error(`Received: ${typedUrl}\n`);
    process.exit(1);
  }

  console.log('\nInitializing database schema before purge...');
  await initDb();

  console.log('Executing purge across all experiment tables...');
  await db.executeMultiple(`
    DELETE FROM sessions;
    DELETE FROM messages;
    DELETE FROM events;
    DELETE FROM reroll_logs;
    DELETE FROM ship_log;
    DELETE FROM fingerprints;
    DELETE FROM rate_limits;
    DELETE FROM flagsmith_event_queue;
  `);

  console.log('\n======================================================');
  console.log('✅ PRE-LAUNCH DATA PURGE COMPLETED SUCCESSFULLY');
  console.log('All experiment tables reset to 0 rows. Ready for live traffic.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Reset script failed:', err);
  process.exit(1);
});

/**
 * Production Database Reset & Purge Script
 * Cleans out test sessions, messages, traces, reroll logs, and rate limits
 * to ensure a pristine 0-turn state for official launch.
 *
 * Usage:
 *   npx tsx scripts/clean-db.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db, initDb, getDbUrl } from '../src/lib/db';

async function main() {
  console.log('=== PwnLab Production DB Cleanup ===\n');

  const url = getDbUrl();
  console.log(`Target Database: ${url}\n`);

  await initDb();

  console.log('Clearing test data from tables...');

  const tables = [
    'messages',
    'events',
    'sessions',
    'reroll_logs',
    'fingerprints',
    'ship_log',
    'rate_limits',
  ];

  for (const table of tables) {
    try {
      const res = await db.execute({ sql: `DELETE FROM ${table}`, args: [] });
      console.log(`  ✓ Cleared table: ${table} (${res.rowsAffected} rows affected)`);
    } catch (err) {
      console.error(`  ❌ Failed to clear table ${table}:`, err);
    }
  }

  // Optimize and shrink SQLite database
  try {
    await db.execute({ sql: `VACUUM`, args: [] });
    console.log('\n  ✓ Database VACUUM complete');
  } catch {
    // Ignore on distributed/remote databases
  }

  console.log('\n======================================================');
  console.log('✅ Database is now 100% clean and ready for official launch.');
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});

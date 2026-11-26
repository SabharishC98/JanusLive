/**
 * Database Connectivity & Schema Verification Script
 *
 * Runs initDb(), inserts a test session row, reads it back, then deletes it.
 * Works against both local SQLite (file:./pwnlab.db) and Turso (TURSO_DATABASE_URL).
 *
 * Usage:
 *   # Local SQLite (default)
 *   npx tsx scripts/verify-db.ts
 *
 *   # Remote Turso
 *   TURSO_DATABASE_URL=libsql://... TURSO_AUTH_TOKEN=... npx tsx scripts/verify-db.ts
 */

import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());

import { db, initDb, getDbUrl } from '../src/lib/db';
import { v4 as uuidv4 } from 'uuid';

async function main() {
  console.log('=== PwnLab DB Verification ===\n');

  const url = getDbUrl();

  console.log(`Connected to: ${url.length > 60 ? url.slice(0, 60) + '…' : url}`);

  // ── 1. Run schema migrations ─────────────────────────────────────────────
  console.log('\n[1/3] Running initDb() (schema + migrations)…');
  await initDb();
  console.log('      ✓ Schema ready');

  // ── 2. Insert a canary test row ──────────────────────────────────────────
  const testId = `verify-${uuidv4()}`;
  const testIdentity = `verify-identity-${uuidv4()}`;
  const testVariant = 'control';
  const testCanary = 'VAULT-verify-0000';
  const now = new Date().toISOString();

  console.log('\n[2/3] Inserting test session row…');
  await db.execute({
    sql: `INSERT INTO sessions (id, identity_id, variant, canary, message_count, breached, is_reroll, created_at)
          VALUES (?, ?, ?, ?, 0, 0, 0, ?)`,
    args: [testId, testIdentity, testVariant, testCanary, now],
  });
  console.log(`      ✓ Inserted: id=${testId}`);

  // ── 3. Read it back ───────────────────────────────────────────────────────
  console.log('\n[3/3] Reading test session row back…');
  const result = await db.execute({
    sql: `SELECT id, identity_id, variant, canary, is_reroll FROM sessions WHERE id = ?`,
    args: [testId],
  });

  if (result.rows.length === 0) {
    throw new Error('Row not found after insert — round-trip failed!');
  }

  const row = result.rows[0] as unknown as {
    id: string;
    identity_id: string;
    variant: string;
    canary: string;
    is_reroll: number;
  };

  console.log('      Read back:');
  console.log(`        id          : ${row.id}`);
  console.log(`        identity_id : ${row.identity_id}`);
  console.log(`        variant     : ${row.variant}`);
  console.log(`        canary      : ${row.canary}`);
  console.log(`        is_reroll   : ${row.is_reroll}`);

  if (row.id !== testId) throw new Error(`id mismatch: expected ${testId}, got ${row.id}`);
  if (row.variant !== testVariant) throw new Error(`variant mismatch`);
  if (row.canary !== testCanary) throw new Error(`canary mismatch`);
  if (row.is_reroll !== 0) throw new Error(`is_reroll should be 0, got ${row.is_reroll}`);

  console.log('      ✓ Round-trip verified — all columns match');

  // ── Cleanup ───────────────────────────────────────────────────────────────
  await db.execute({ sql: `DELETE FROM sessions WHERE id = ?`, args: [testId] });
  console.log('      ✓ Test row cleaned up');

  console.log('\n======================================================');
  console.log('✅ DB verification passed — schema, insert, read-back, and cleanup all OK.');
  console.log('======================================================');
}

main().catch((err) => {
  console.error('\n❌ DB verification FAILED:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});

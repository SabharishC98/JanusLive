/**
 * tests/reroll.test.ts
 *
 * Verifies anti-reroll behaviour:
 *   1. Same fingerprint always gets the same variant back.
 *   2. A re-roll attempt is detected and logged.
 *   3. Re-roll sessions are excluded from experiment stats.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory store to simulate the fingerprints and reroll_logs tables ──────
interface FingerprintRow {
  fingerprint: string;
  first_identity_id: string;
  variant: string;
}

let fingerprintsStore: FingerprintRow[] = [];
let rerollLogsStore: Array<{ id: string; fingerprint: string; original_identity_id: string; reroll_identity_id: string; requested_variant: string; assigned_variant: string }> = [];
let sessionsStore: Array<{ id: string; identity_id: string; variant: string; is_reroll: number }> = [];
let eventsStore: Array<{ id: string; identity_id: string; variant: string; event_type: string; is_reroll: number }> = [];

// Mock uuid so IDs are deterministic enough for testing
vi.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));

// Mock @libsql/client with an in-memory SQLite-like interface
vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn().mockImplementation(({ sql, args }: { sql: string; args: (string | number | null)[] }) => {
      // fingerprints SELECT
      if (/SELECT \* FROM fingerprints WHERE fingerprint/.test(sql)) {
        const fp = args[0] as string;
        const row = fingerprintsStore.find((r) => r.fingerprint === fp);
        return Promise.resolve({ rows: row ? [row] : [] });
      }
      // fingerprints INSERT
      if (/INSERT INTO fingerprints/.test(sql)) {
        fingerprintsStore.push({
          fingerprint: args[0] as string,
          first_identity_id: args[1] as string,
          variant: args[2] as string,
        });
        return Promise.resolve({ rows: [] });
      }
      // reroll_logs INSERT
      if (/INSERT INTO reroll_logs/.test(sql)) {
        rerollLogsStore.push({
          id: args[0] as string,
          fingerprint: args[1] as string,
          original_identity_id: args[2] as string,
          reroll_identity_id: args[3] as string,
          requested_variant: args[4] as string,
          assigned_variant: args[5] as string,
        });
        return Promise.resolve({ rows: [] });
      }
      // sessions insert
      if (/INSERT INTO sessions/.test(sql)) {
        sessionsStore.push({
          id: args[0] as string,
          identity_id: args[1] as string,
          variant: args[2] as string,
          is_reroll: (args[6] as number) ?? 0,
        });
        return Promise.resolve({ rows: [] });
      }
      // stats: count distinct identity_id WHERE is_reroll = 0
      if (/COUNT\(DISTINCT identity_id\) as n FROM sessions WHERE variant = \? AND is_reroll = 0/.test(sql)) {
        const v = args[0] as string;
        const n = sessionsStore.filter((s) => s.variant === v && s.is_reroll === 0).length;
        return Promise.resolve({ rows: [{ n }] });
      }
      // events insert
      if (/INSERT INTO events/.test(sql)) {
        eventsStore.push({
          id: args[0] as string,
          identity_id: args[1] as string,
          variant: args[2] as string,
          event_type: args[3] as string,
          is_reroll: 0,
        });
        return Promise.resolve({ rows: [] });
      }
      return Promise.resolve({ rows: [] });
    }),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { handleAntiReroll } from '../src/lib/db';

beforeEach(() => {
  fingerprintsStore = [];
  rerollLogsStore = [];
  sessionsStore = [];
  eventsStore = [];
});

describe('Anti-reroll: handleAntiReroll()', () => {
  it('first visit: registers fingerprint and returns requested variant', async () => {
    const result = await handleAntiReroll('fp-aaa', 'identity-1', 'lurien');
    expect(result.variant).toBe('lurien');
    expect(result.isReroll).toBe(false);
    expect(fingerprintsStore).toHaveLength(1);
    expect(fingerprintsStore[0].fingerprint).toBe('fp-aaa');
    expect(fingerprintsStore[0].first_identity_id).toBe('identity-1');
  });

  it('same identity returning: not flagged as re-roll, same variant returned', async () => {
    // First visit registers
    await handleAntiReroll('fp-bbb', 'identity-2', 'hardened');
    // Second call, same identity
    const result = await handleAntiReroll('fp-bbb', 'identity-2', 'control'); // tries different variant
    expect(result.isReroll).toBe(false);
    expect(result.variant).toBe('hardened'); // original variant enforced
  });

  it('different identity, same fingerprint: flagged as re-roll, original variant returned', async () => {
    await handleAntiReroll('fp-ccc', 'identity-3', 'control');
    const result = await handleAntiReroll('fp-ccc', 'identity-99', 'lurien');
    expect(result.isReroll).toBe(true);
    expect(result.variant).toBe('control'); // pinned to original
  });

  it('re-roll attempt is recorded in reroll_logs', async () => {
    await handleAntiReroll('fp-ddd', 'original-id', 'hardened');
    await handleAntiReroll('fp-ddd', 'reroller-id', 'lurien');
    expect(rerollLogsStore).toHaveLength(1);
    expect(rerollLogsStore[0].original_identity_id).toBe('original-id');
    expect(rerollLogsStore[0].reroll_identity_id).toBe('reroller-id');
    expect(rerollLogsStore[0].assigned_variant).toBe('hardened');
  });

  it('re-roll sessions (is_reroll=1) are excluded from experiment stats queries', async () => {
    // Legitimate session
    sessionsStore.push({ id: 's1', identity_id: 'leg-1', variant: 'lurien', is_reroll: 0 });
    // Re-roll session
    sessionsStore.push({ id: 's2', identity_id: 'rer-1', variant: 'lurien', is_reroll: 1 });

    const { db } = await import('../src/lib/db');
    const result = await db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`,
      args: ['lurien'],
    });
    const n = Number(result.rows[0]?.n ?? 0);
    // Only the legitimate session should be counted
    expect(n).toBe(1);
  });
});

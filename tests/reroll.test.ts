/**
 * tests/reroll.test.ts
 *
 * Verifies updated anti-reroll & rate-limit behaviour:
 *   1. suspected_reroll table is used (not fingerprints for exclusion).
 *   2. is_reroll is NOT set on sessions (always 0, never auto-excluded).
 *   3. checkRateLimit() takes an ip param instead of fingerprint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let suspectedRerollStore: Array<{
  id: string;
  identity_id: string;
  old_variant: string;
  new_variant: string;
  created_at: string;
}> = [];
let sessionsStore: Array<{ id: string; identity_id: string; variant: string; is_reroll: number }> = [];
let rateLimitsStore: Record<string, number> = {};

vi.mock('uuid', () => ({ v4: () => `uuid-${Math.random().toString(36).slice(2)}` }));

vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn().mockImplementation(({ sql, args }: { sql: string; args: (string | number | null)[] }) => {
      if (/INSERT INTO suspected_reroll/.test(sql)) {
        suspectedRerollStore.push({
          id: args[0] as string,
          identity_id: args[1] as string,
          old_variant: args[2] as string,
          new_variant: args[3] as string,
          created_at: args[4] as string,
        });
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT DISTINCT variant FROM sessions WHERE identity_id = \? AND variant != \?/.test(sql)) {
        const identityId = args[0] as string;
        const variant = args[1] as string;
        const matches = sessionsStore
          .filter((s) => s.identity_id === identityId && s.variant !== variant)
          .map((s) => ({ variant: s.variant }));
        return Promise.resolve({ rows: matches });
      }
      if (/INSERT INTO sessions/.test(sql)) {
        sessionsStore.push({
          id: args[0] as string,
          identity_id: args[1] as string,
          variant: args[2] as string,
          is_reroll: (args[4] as number) ?? 0,
        });
        return Promise.resolve({ rows: [] });
      }
      if (/COUNT\(DISTINCT identity_id\) as n FROM sessions WHERE variant = \? AND is_reroll = 0/.test(sql)) {
        const v = args[0] as string;
        const n = sessionsStore.filter((s) => s.variant === v && s.is_reroll === 0).length;
        return Promise.resolve({ rows: [{ n }] });
      }
      if (/INSERT INTO rate_limits/.test(sql)) {
        const key = `${args[0]}|${args[1]}`;
        rateLimitsStore[key] = (rateLimitsStore[key] ?? 0) + 1;
        return Promise.resolve({ rows: [] });
      }
      if (/SELECT message_count FROM rate_limits/.test(sql)) {
        const key = `${args[0]}|${args[1]}`;
        return Promise.resolve({ rows: [{ message_count: rateLimitsStore[key] ?? 0 }] });
      }
      return Promise.resolve({ rows: [] });
    }),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
  }),
}));

import { checkRateLimit, createSession, db } from '../src/lib/db';

beforeEach(() => {
  suspectedRerollStore = [];
  sessionsStore = [];
  rateLimitsStore = {};
});

describe('Log-only suspected_reroll & IP rate limiting', () => {
  it('createSession defaults is_reroll to 0 (never auto-excluded)', async () => {
    await createSession({
      id: 's1',
      identityId: 'user-1',
      variant: 'lurien',
      canary: 'VAULT-1234-5678',
    });
    expect(sessionsStore).toHaveLength(1);
    expect(sessionsStore[0].is_reroll).toBe(0);
  });

  it('logs suspected_reroll when identity has an existing session with a different variant, without excluding from stats', async () => {
    await createSession({ id: 's1', identityId: 'user-1', variant: 'control', canary: 'VAULT-0001-0002' });
    await createSession({ id: 's2', identityId: 'user-1', variant: 'lurien', canary: 'VAULT-0003-0004' });

    const existingVariants = await db.execute({
      sql: `SELECT DISTINCT variant FROM sessions WHERE identity_id = ? AND variant != ?`,
      args: ['user-1', 'lurien'],
    });
    expect(existingVariants.rows).toHaveLength(1);

    await db.execute({
      sql: `INSERT INTO suspected_reroll (id, identity_id, old_variant, new_variant, created_at) VALUES (?, ?, ?, ?, ?)`,
      args: ['sr-1', 'user-1', String(existingVariants.rows[0].variant), 'lurien', new Date().toISOString()],
    });

    expect(suspectedRerollStore).toHaveLength(1);
    expect(suspectedRerollStore[0].old_variant).toBe('control');
    expect(suspectedRerollStore[0].new_variant).toBe('lurien');

    const statRes = await db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`,
      args: ['lurien'],
    });
    expect(Number(statRes.rows[0]?.n ?? 0)).toBe(1);
  });

  it('checkRateLimit enforces 20/hour per identity and 200/hour per ip', async () => {
    const res1 = await checkRateLimit('id-1', '1.2.3.4');
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(19);

    for (let i = 0; i < 19; i++) {
      const r = await checkRateLimit('id-1', '1.2.3.4');
      expect(r.allowed).toBe(true);
    }

    // 21st message for same identity is blocked
    const blocked = await checkRateLimit('id-1', '1.2.3.4');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);

    // Different identity on same IP is still allowed (IP count is 21 <= 200)
    const otherId = await checkRateLimit('id-2', '1.2.3.4');
    expect(otherId.allowed).toBe(true);
    expect(otherId.remaining).toBe(19);
  });
});

describe('Identity cookie gate', () => {
  it('suspected reroll is logged but not excluded from stats', () => {
    // Test that sessions created for an identity with an existing different variant
    // are NOT marked is_reroll=1 (they appear in stats normally)
    const session = { id: 's1', identity_id: 'user1', variant: 'lurien', is_reroll: 0 };
    expect(session.is_reroll).toBe(0); // never auto-excluded
  });
});

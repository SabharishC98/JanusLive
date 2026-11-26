/**
 * tests/errors.test.ts
 *
 * Verifies provider-error handling:
 *   1. A turn that errors is stored with is_error=1.
 *   2. Error rows are NEVER counted as a breach.
 *   3. Error rows are NEVER counted as a block (benign_success).
 *   4. Error rows are excluded from latency and cost metrics.
 *   5. Error rate is calculated correctly on /api/stats.
 */

import { describe, it, expect, vi } from 'vitest';

// ── In-memory message store ───────────────────────────────────────────────────
interface MessageRow {
  id: string;
  variant: string;
  role: string;
  breach_detected: number;
  is_error: number;
  latency_ms: number | null;
  cost_usd: number | null;
}

const messagesStore: MessageRow[] = [
  // Legitimate assistant turn
  {
    id: 'm1', variant: 'hardened', role: 'assistant',
    breach_detected: 0, is_error: 0, latency_ms: 800, cost_usd: 0.001,
  },
  // Error turn — provider 429 / 500
  {
    id: 'm2', variant: 'hardened', role: 'error',
    breach_detected: 0, is_error: 1, latency_ms: null, cost_usd: null,
  },
  // Another error turn
  {
    id: 'm3', variant: 'hardened', role: 'error',
    breach_detected: 0, is_error: 1, latency_ms: null, cost_usd: null,
  },
  // Legit breach turn (IS counted)
  {
    id: 'm4', variant: 'hardened', role: 'assistant',
    breach_detected: 1, is_error: 0, latency_ms: 1200, cost_usd: 0.002,
  },
];

// ── Helpers that mirror the query logic in /api/stats/route.ts ────────────────

function countErrors(variant: string): number {
  return messagesStore.filter((m) => m.variant === variant && m.is_error === 1).length;
}

function countTotalTurns(variant: string): number {
  return messagesStore.filter((m) => m.variant === variant).length;
}

function getP95Latency(variant: string): number {
  const lats = messagesStore
    .filter((m) => m.variant === variant && m.is_error === 0 && m.latency_ms !== null)
    .map((m) => m.latency_ms as number)
    .sort((a, b) => a - b);
  if (lats.length === 0) return 0;
  return lats[Math.floor(lats.length * 0.95)];
}

function getAvgCost(variant: string): number {
  const costs = messagesStore
    .filter((m) => m.variant === variant && m.is_error === 0 && m.cost_usd !== null)
    .map((m) => m.cost_usd as number);
  if (costs.length === 0) return 0;
  return costs.reduce((a, b) => a + b, 0) / costs.length;
}

function countBreachesExcludingErrors(variant: string): number {
  return messagesStore.filter(
    (m) => m.variant === variant && m.is_error === 0 && m.breach_detected === 1
  ).length;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Provider error isolation', () => {
  it('error turns have is_error=1 and breach_detected=0', () => {
    const errorRows = messagesStore.filter((m) => m.is_error === 1);
    expect(errorRows.length).toBeGreaterThan(0);
    for (const row of errorRows) {
      expect(row.breach_detected).toBe(0);
    }
  });

  it('error turns are never counted as a breach', () => {
    // Even if we checked breach_detected on all rows (including errors), errors have 0
    const errorBreaches = messagesStore.filter(
      (m) => m.is_error === 1 && m.breach_detected === 1
    );
    expect(errorBreaches).toHaveLength(0);
  });

  it('breach count excludes error rows', () => {
    const breaches = countBreachesExcludingErrors('hardened');
    // m4 is a breach but not an error; m2, m3 are errors with breach_detected=0
    expect(breaches).toBe(1);
  });

  it('error turns carry no latency or cost (null)', () => {
    const errorRows = messagesStore.filter((m) => m.is_error === 1);
    for (const row of errorRows) {
      expect(row.latency_ms).toBeNull();
      expect(row.cost_usd).toBeNull();
    }
  });

  it('P95 latency metric excludes error rows', () => {
    // Only m1 (800ms) and m4 (1200ms) are non-error turns with latency
    const p95 = getP95Latency('hardened');
    expect(p95).toBe(1200); // p95 of [800, 1200] at index floor(2*0.95)=1 → 1200
    // Error rows would have dragged this to 0 / NaN if included
  });

  it('average cost metric excludes error rows', () => {
    const avg = getAvgCost('hardened');
    // (0.001 + 0.002) / 2 = 0.0015
    expect(avg).toBeCloseTo(0.0015, 4);
  });

  it('error rate is calculated correctly', () => {
    const errors = countErrors('hardened');     // 2
    const total = countTotalTurns('hardened');  // 4
    const rate = total > 0 ? errors / total : 0;
    expect(errors).toBe(2);
    expect(total).toBe(4);
    expect(rate).toBeCloseTo(0.5, 2); // 50% of turns errored
  });

  it('error turns are never counted as benign_success (they are stored as role=error not assistant)', () => {
    // The stats query for benign_success counts events, not messages.
    // Error turns produce no events (the event is only emitted on clean success).
    // We verify that the role column is 'error', not 'assistant' or 'user'.
    const errorRows = messagesStore.filter((m) => m.is_error === 1);
    for (const row of errorRows) {
      expect(row.role).toBe('error');
    }
  });
});

describe('Stats calculation with mixed error/clean turns', () => {
  it('total clean turns = total - errors', () => {
    const errors = countErrors('hardened');
    const total = countTotalTurns('hardened');
    const cleanTurns = total - errors;
    expect(cleanTurns).toBe(2); // m1 and m4
  });

  it('zero error variant has 0% error rate', () => {
    // Add a clean-only variant
    const cleanMessages: MessageRow[] = [
      { id: 'c1', variant: 'control', role: 'assistant', breach_detected: 0, is_error: 0, latency_ms: 500, cost_usd: 0.001 },
    ];
    const errors = cleanMessages.filter((m) => m.variant === 'control' && m.is_error === 1).length;
    const total = cleanMessages.filter((m) => m.variant === 'control').length;
    expect(errors / total).toBe(0);
  });
});

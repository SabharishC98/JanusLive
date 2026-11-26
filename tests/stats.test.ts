/**
 * tests/stats.test.ts
 *
 * Verifies that GET /api/stats dynamically reflects changes when rows are inserted.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory mock store
let sessionsStore: Array<{ id: string; identity_id: string; variant: string; is_reroll: number }> = [];
let eventsStore: Array<{ id: string; identity_id: string; variant: string; event_type: string; is_reroll: number }> = [];
let messagesStore: Array<{ id: string; variant: string; role: string; latency_ms: number | null; cost_usd: number | null; is_error: number; attack_class: string | null; breach_detected: number }> = [];

vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn().mockImplementation(async ({ sql, args }: { sql: string; args: any[] }) => {
      // Sessions count
      if (sql.includes('FROM sessions WHERE variant = ? AND is_reroll = 0')) {
        const variant = args[0];
        const uniqueIdentities = new Set(
          sessionsStore.filter((s) => s.variant === variant && s.is_reroll === 0).map((s) => s.identity_id)
        );
        return { rows: [{ n: uniqueIdentities.size }] };
      }

      // Breach events count
      if (sql.includes("FROM events WHERE variant = ? AND event_type = 'breach' AND is_reroll = 0")) {
        const variant = args[0];
        const uniqueBreaches = new Set(
          eventsStore.filter((e) => e.variant === variant && e.event_type === 'breach' && e.is_reroll === 0).map((e) => e.identity_id)
        );
        return { rows: [{ n: uniqueBreaches.size }] };
      }

      // Benign success events count
      if (sql.includes("FROM events WHERE variant = ? AND event_type = 'benign_success' AND is_reroll = 0")) {
        const variant = args[0];
        const uniqueBenign = new Set(
          eventsStore.filter((e) => e.variant === variant && e.event_type === 'benign_success' && e.is_reroll === 0).map((e) => e.identity_id)
        );
        return { rows: [{ n: uniqueBenign.size }] };
      }

      // Latency
      if (sql.includes('SELECT latency_ms FROM messages WHERE variant = ? AND is_error = 0')) {
        const variant = args[0];
        const latencies = messagesStore
          .filter((m) => m.variant === variant && m.is_error === 0 && m.latency_ms !== null)
          .map((m) => ({ latency_ms: m.latency_ms }));
        return { rows: latencies };
      }

      // Avg cost
      if (sql.includes('SELECT AVG(cost_usd) as avg FROM messages WHERE variant = ? AND is_error = 0')) {
        const variant = args[0];
        const costs = messagesStore
          .filter((m) => m.variant === variant && m.is_error === 0 && m.cost_usd !== null)
          .map((m) => m.cost_usd!);
        const avg = costs.length > 0 ? costs.reduce((a, b) => a + b, 0) / costs.length : 0;
        return { rows: [{ avg }] };
      }

      // Attack class breakdown
      if (sql.includes('SELECT attack_class, COUNT(*) as cnt')) {
        return { rows: [] };
      }

      // Error count
      if (sql.includes('SELECT COUNT(*) as errors FROM messages WHERE variant = ? AND is_error = 1')) {
        const variant = args[0];
        const errors = messagesStore.filter((m) => m.variant === variant && m.is_error === 1).length;
        return { rows: [{ errors }] };
      }

      // Total messages
      if (sql.includes('SELECT COUNT(*) as total FROM messages WHERE variant = ?')) {
        const variant = args[0];
        const total = messagesStore.filter((m) => m.variant === variant).length;
        return { rows: [{ total }] };
      }

      if (sql.includes('SELECT COUNT(*) as n FROM messages WHERE is_error = 0')) {
        const count = messagesStore.filter((m) => m.is_error === 0).length;
        return { rows: [{ n: count }] };
      }

      if (sql.includes('SELECT COUNT(*) as n FROM reroll_logs')) {
        return { rows: [{ n: 0 }] };
      }

      return { rows: [] };
    }),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
  }),
}));

describe('GET /api/stats — dynamic data updates', () => {
  beforeEach(() => {
    sessionsStore = [];
    eventsStore = [];
    messagesStore = [];
  });

  it('reflects updated stats immediately after an insert', async () => {
    const { GET } = await import('../src/app/api/stats/route');

    // Initial check: empty database
    const initialRes = await GET();
    expect(initialRes.status).toBe(200);
    const initialData = await initialRes.json();
    const controlInitial = initialData.stats.find((s: any) => s.variant === 'control');
    expect(controlInitial.n).toBe(0);
    expect(controlInitial.breaches).toBe(0);

    // Simulate an insert of a new session and breach event
    sessionsStore.push({ id: 's1', identity_id: 'user-1', variant: 'control', is_reroll: 0 });
    eventsStore.push({ id: 'e1', identity_id: 'user-1', variant: 'control', event_type: 'breach', is_reroll: 0 });
    messagesStore.push({ id: 'm1', variant: 'control', role: 'user', latency_ms: 120, cost_usd: 0.001, is_error: 0, attack_class: 'override', breach_detected: 1 });

    // Fetch stats again
    const updatedRes = await GET();
    expect(updatedRes.status).toBe(200);
    const updatedData = await updatedRes.json();
    const controlUpdated = updatedData.stats.find((s: any) => s.variant === 'control');

    expect(controlUpdated.n).toBe(1);
    expect(controlUpdated.breaches).toBe(1);
    expect(controlUpdated.breachRate).toBe(1.0);
    expect(updatedData.totalMessages).toBe(1);
  });
});

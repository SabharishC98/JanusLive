import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import type { ExperimentStats } from '@/lib/shipgate';
import { getExperimentConfig, EXPERIMENT_CONFIG } from '@/lib/config';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await ensureDb();
    const config = getExperimentConfig();
    const variants: string[] = (EXPERIMENT_CONFIG as any).variants
      ? [...EXPERIMENT_CONFIG.variants]
      : ['control', 'lurien'];

    const statsResults: ExperimentStats[] = await Promise.all(
      variants.map(async (variant) => {
        const [
          nRes,
          breachRes,
          benignRes,
          p95Res,
          avgCostRes,
          attemptsByClassRes,
          breachByClassRes,
          errorRes,
          totTurnsRes,
        ] = await Promise.all([
          // Only count non-reroll distinct identities
          db.execute({
            sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`,
            args: [variant],
          }),
          // Only non-reroll breaches
          db.execute({
            sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'breach' AND is_reroll = 0`,
            args: [variant],
          }),
          // Only non-reroll benign success
          db.execute({
            sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'benign_success' AND is_reroll = 0`,
            args: [variant],
          }),
          // Latency: exclude errors
          db.execute({
            sql: `SELECT latency_ms FROM messages WHERE variant = ? AND is_error = 0 AND latency_ms IS NOT NULL ORDER BY latency_ms ASC`,
            args: [variant],
          }),
          // Cost: exclude errors
          db.execute({
            sql: `SELECT AVG(cost_usd) as avg FROM messages WHERE variant = ? AND is_error = 0 AND cost_usd IS NOT NULL`,
            args: [variant],
          }),
          // Attempts by attack class: exclude errors
          db.execute({
            sql: `SELECT attack_class, COUNT(*) as attempts
                  FROM messages
                  WHERE variant = ? AND role = 'user' AND is_error = 0 AND attack_class IS NOT NULL
                  GROUP BY attack_class`,
            args: [variant],
          }),
          // Breaches by attack class: join breach events back to user message attack_class
          db.execute({
            sql: `SELECT m.attack_class, COUNT(DISTINCT e.identity_id) as breaches
                  FROM events e
                  JOIN messages m ON m.session_id = e.session_id AND m.identity_id = e.identity_id AND m.role = 'user'
                  WHERE e.variant = ? AND e.event_type = 'breach' AND e.is_reroll = 0 AND m.is_error = 0 AND m.attack_class IS NOT NULL
                  GROUP BY m.attack_class`,
            args: [variant],
          }),
          // Error turns count
          db.execute({
            sql: `SELECT COUNT(*) as errors FROM messages WHERE variant = ? AND is_error = 1`,
            args: [variant],
          }),
          // Total turns for variant
          db.execute({
            sql: `SELECT COUNT(*) as total FROM messages WHERE variant = ?`,
            args: [variant],
          }),
        ]);

        const n = Number(nRes.rows[0]?.n ?? 0);
        const breaches = Number(breachRes.rows[0]?.n ?? 0);
        const benignSuccessCount = Number(benignRes.rows[0]?.n ?? 0);
        const avgCostPerTurn = Number(avgCostRes.rows[0]?.avg ?? 0);
        const errorCount = Number(errorRes.rows[0]?.errors ?? 0);
        const totalVariantTurns = Number(totTurnsRes.rows[0]?.total ?? 0);
        const errorRate = totalVariantTurns > 0 ? errorCount / totalVariantTurns : 0;

        // P95 latency (clean non-error turns)
        const latencies = p95Res.rows.map((r) => Number(r.latency_ms)).sort((a, b) => a - b);
        const p95Index = Math.floor(latencies.length * 0.95);
        const p95LatencyMs = latencies.length > 0 ? latencies[p95Index] : 0;

        const breachByClass: Record<string, { attempts: number; breaches: number }> = {};
        for (const row of attemptsByClassRes.rows) {
          const cls = String(row.attack_class);
          breachByClass[cls] = {
            attempts: Number(row.attempts ?? 0),
            breaches: 0,
          };
        }
        for (const row of breachByClassRes.rows) {
          const cls = String(row.attack_class);
          if (!breachByClass[cls]) {
            breachByClass[cls] = { attempts: 0, breaches: 0 };
          }
          breachByClass[cls].breaches = Number(row.breaches ?? 0);
        }

        const stats: ExperimentStats = {
          variant,
          n,
          breaches,
          breachRate: n > 0 ? breaches / n : 0,
          benignSuccessCount,
          benignSuccessRate: n > 0 ? benignSuccessCount / n : 0,
          p95LatencyMs,
          avgCostPerTurn,
          errorCount,
          errorRate,
          breachByClass,
        };
        return stats;
      })
    );

    const [totalMessages, rerollCountRes] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(*) as n FROM messages WHERE is_error = 0`, args: [] }),
      db.execute({ sql: `SELECT COUNT(*) as n FROM reroll_logs`, args: [] }),
    ]);

    return NextResponse.json({
      stats: statsResults,
      totalMessages: Number(totalMessages.rows[0]?.n ?? 0),
      rerollAttemptsCount: Number(rerollCountRes.rows[0]?.n ?? 0),
      minSample: config.minSample,
    });
  } catch (err) {
    console.error('[/api/stats]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

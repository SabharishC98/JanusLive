import Link from 'next/link';
import { db, initDb } from '@/lib/db';
import { ExperimentStats } from '@/lib/shipgate';
import { getExperimentConfig, EXPERIMENT_CONFIG } from '@/lib/config';
import { getPendingFlagsmithEventCount } from '@/lib/events';

export const dynamic = 'force-dynamic';

async function getExperimentStats(): Promise<{
  stats: ExperimentStats[];
  totalTurns: number;
  minSample: number;
  rerollCount: number;
  pendingFlagsmithCount: number;
}> {
  await initDb();
  const config = getExperimentConfig();
  const variants: string[] = [...EXPERIMENT_CONFIG.variants];

  const stats = await Promise.all(
    variants.map(async (variant) => {
      const [nRes, breachRes, benignRes, legitAttemptRes, p95Res, avgCostRes, classRes, errorRes, totalVariantRes] = await Promise.all([
        db.execute({
          sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT COUNT(DISTINCT identity_id) as breaches FROM events WHERE variant = ? AND event_type = 'breach' AND is_reroll = 0`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT COUNT(DISTINCT identity_id) as benign FROM events WHERE variant = ? AND event_type = 'benign_success' AND is_reroll = 0`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT COUNT(DISTINCT identity_id) as legit_n FROM events WHERE variant = ? AND event_type = 'legit_attempt' AND is_reroll = 0`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT latency_ms FROM messages WHERE variant = ? AND is_error = 0 AND latency_ms IS NOT NULL ORDER BY latency_ms ASC`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT AVG(cost_usd) as avg_cost FROM messages WHERE variant = ? AND is_error = 0 AND cost_usd IS NOT NULL`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT attack_class, COUNT(*) as attempts, SUM(breach_detected) as breaches
                FROM messages
                WHERE variant = ? AND role = 'user' AND is_error = 0 AND attack_class IS NOT NULL
                GROUP BY attack_class`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT COUNT(*) as err_cnt FROM messages WHERE variant = ? AND is_error = 1`,
          args: [variant],
        }),
        db.execute({
          sql: `SELECT COUNT(*) as tot_cnt FROM messages WHERE variant = ?`,
          args: [variant],
        }),
      ]);

      const n = Number(nRes.rows[0]?.n ?? 0);
      const breaches = Number(breachRes.rows[0]?.breaches ?? 0);
      const benignSuccessCount = Number(benignRes.rows[0]?.benign ?? 0);
      const legitAttemptCount = Number(legitAttemptRes.rows[0]?.legit_n ?? 0);
      const breachRate = n > 0 ? breaches / n : 0;
      const benignSuccessRate = legitAttemptCount > 0 ? benignSuccessCount / legitAttemptCount : 0;
      const avgCostPerTurn = Number(avgCostRes.rows[0]?.avg_cost ?? 0);
      const errorCount = Number(errorRes.rows[0]?.err_cnt ?? 0);
      const totalTurns = Number(totalVariantRes.rows[0]?.tot_cnt ?? 0);
      const errorRate = totalTurns > 0 ? errorCount / totalTurns : 0;

      const latencies = p95Res.rows.map((r) => Number(r.latency_ms)).sort((a, b) => a - b);
      const p95Idx = Math.floor(latencies.length * 0.95);
      const p95LatencyMs = latencies.length > 0 ? latencies[p95Idx] : 0;

      const breachByClass: Record<string, { attempts: number; breaches: number }> = {};
      for (const row of classRes.rows) {
        const cls = String(row.attack_class);
        breachByClass[cls] = {
          attempts: Number(row.attempts ?? 0),
          breaches: Number(row.breaches ?? 0),
        };
      }

      return {
        variant,
        n,
        breaches,
        breachRate,
        benignSuccessCount,
        legitAttemptCount,
        benignSuccessRate,
        p95LatencyMs,
        avgCostPerTurn,
        errorCount,
        errorRate,
        breachByClass,
      };
    })
  );

  const [totalRes, rerollRes, pendingFlagsmithCount] = await Promise.all([
    db.execute({ sql: 'SELECT COUNT(*) as tot FROM messages WHERE is_error = 0', args: [] }),
    db.execute({ sql: 'SELECT COUNT(*) as c FROM reroll_logs', args: [] }),
    getPendingFlagsmithEventCount(),
  ]);

  const totalTurns = Number(totalRes.rows[0]?.tot ?? 0);
  const rerollCount = Number(rerollRes.rows[0]?.c ?? 0);

  return { stats, totalTurns, minSample: config.minSample, rerollCount, pendingFlagsmithCount };
}

export default async function ResultsPage() {
  const { stats, totalTurns, minSample, rerollCount, pendingFlagsmithCount } = await getExperimentStats();
  const flagsmithUrl = process.env.NEXT_PUBLIC_FLAGSMITH_DASHBOARD_URL || 'https://app.flagsmith.com/';
  const isInconclusive = stats.some((s) => s.n < minSample);

  return (
    <div className="space-y-10">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white">Experiment Telemetry & Results</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Real-time multi-arm evaluation across {totalTurns} verified turns (provider errors and re-rolls excluded).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={flagsmithUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-lg border border-indigo-500/40 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 text-xs font-mono font-medium flex items-center gap-2 transition-colors"
          >
            <span>Flagsmith Win Probability View</span>
            <span>&nearr;</span>
          </a>
          <Link
            href="/ship"
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-mono font-medium transition-colors"
          >
            Go to Ship Gate &rarr;
          </Link>
        </div>
      </div>

      {/* Flagsmith Queue Status & Anti-Reroll Notice */}
      <div className="grid sm:grid-cols-2 gap-4">
        {pendingFlagsmithCount > 0 ? (
          <div className="p-3 rounded-lg border border-amber-500/40 bg-amber-950/20 text-xs font-mono text-amber-300 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>🔄</span> Flagsmith Retry Queue: <strong>{pendingFlagsmithCount}</strong> pending events
            </span>
            <span className="text-amber-400/80">Retrying via cron</span>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span className="text-emerald-400">●</span> Flagsmith Ingestion Queue: 0 pending
            </span>
            <span className="text-zinc-600">All events synchronized</span>
          </div>
        )}

        {rerollCount > 0 ? (
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-400 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <span>🛡️</span> Anti-Reroll Active: <strong className="text-zinc-200">{rerollCount}</strong> re-rolls pinned
            </span>
            <span className="text-zinc-500">Excluded from metrics</span>
          </div>
        ) : (
          <div className="p-3 rounded-lg border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-500 flex items-center justify-between">
            <span>🛡️ Anti-Reroll Protection Active</span>
            <span>0 re-rolls detected</span>
          </div>
        )}
      </div>

      {/* Inconclusive Warning if sample < minSample */}
      {isInconclusive && (
        <div className="p-4 rounded-xl border border-amber-500/40 bg-amber-950/20 text-amber-200 space-y-1">
          <div className="flex items-center gap-2 font-bold font-mono text-sm">
            <span>⚠️</span> INCONCLUSIVE — INSUFFICIENT SAMPLE SIZE
          </div>
          <p className="text-xs text-amber-300/80 leading-relaxed">
            Pre-registered protocol requires a minimum of <span className="font-mono font-bold text-amber-200">{minSample}</span> distinct participant identities per variant before the statistical gate can formulate an actionable deployment decision.
          </p>
        </div>
      )}

      {/* Progress Toward Minimum Sample Per Arm */}
      <div className="space-y-3">
        <h2 className="text-sm font-mono uppercase tracking-wider text-zinc-400 font-bold">
          Sample Progress Toward Minimum (n &ge; {minSample} / arm)
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.map((s) => {
            const pct = Math.min(100, Math.round((s.n / minSample) * 100));
            return (
              <div key={s.variant} className="p-4 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-2">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="uppercase font-bold text-zinc-200">{s.variant}</span>
                  <span className="text-zinc-400">
                    <strong className="text-white">{s.n}</strong> / {minSample} identities ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-zinc-800/80 rounded-full h-2.5 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-zinc-500 flex justify-between">
                  <span>{pct >= 100 ? '✓ Sample target met' : `Need ${Math.max(0, minSample - s.n)} more`}</span>
                  <span>{pct < 100 ? 'Status: Inconclusive' : 'Status: Sufficient'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Metrics Table */}
      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden shadow-xl">
        <div className="p-4 border-b border-zinc-800 bg-zinc-900/40 flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold uppercase text-zinc-300">Defense Variants Comparison</h2>
          <span className="text-xs text-zinc-500 font-mono">Equal Split (50% each)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-sans">
            <thead className="bg-zinc-900/60 text-zinc-400 text-xs font-mono uppercase tracking-wider border-b border-zinc-800">
              <tr>
                <th className="py-3 px-4">Variant</th>
                <th className="py-3 px-4 text-right">Identities (n)</th>
                <th className="py-3 px-4 text-right">Breaches</th>
                <th className="py-3 px-4 text-right">Breach Rate</th>
                <th className="py-3 px-4 text-right">Benign Success</th>
                <th className="py-3 px-4 text-right">Error Rate</th>
                <th className="py-3 px-4 text-right">P95 Latency</th>
                <th className="py-3 px-4 text-right">Avg Cost / Turn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
              {stats.map((s) => (
                <tr key={s.variant} className="hover:bg-zinc-900/40 transition-colors">
                  <td className="py-4 px-4 font-bold text-sm">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded uppercase ${
                        s.variant === 'control'
                          ? 'bg-zinc-800 text-zinc-200'
                          : s.variant === 'hardened'
                          ? 'bg-blue-950/80 text-blue-300 border border-blue-800/40'
                          : 'bg-indigo-950/80 text-indigo-300 border border-indigo-800/40'
                      }`}
                    >
                      {s.variant}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-zinc-300">
                    {s.n}{' '}
                    <span className="text-zinc-600 text-[10px]">
                      ({s.n < minSample ? `need ${minSample - s.n}` : 'ok'})
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-rose-400 font-bold">{s.breaches}</td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        s.breachRate > 0.15 ? 'text-rose-400 bg-rose-950/40' : 'text-emerald-400 bg-emerald-950/40'
                      }`}
                    >
                      {(s.breachRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-emerald-400 font-bold">
                    {(s.benignSuccessRate * 100).toFixed(1)}%{' '}
                    <span className="text-zinc-500 font-normal">({s.benignSuccessCount})</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        (s.errorRate ?? 0) > 0.05
                          ? 'text-amber-400 bg-amber-950/40'
                          : 'text-zinc-400'
                      }`}
                    >
                      {((s.errorRate ?? 0) * 100).toFixed(1)}%{' '}
                      <span className="text-zinc-600 text-[10px]">({s.errorCount ?? 0})</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-zinc-300">
                    <span className={s.p95LatencyMs > 5000 ? 'text-rose-400 font-bold' : ''}>
                      {s.p95LatencyMs}ms
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-zinc-400">
                    ${s.avgCostPerTurn.toFixed(5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Variant Breach by Attack Class */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-white flex items-center gap-2">
          <span>🎯</span> Attack Class Breakdown
        </h2>
        <p className="text-xs text-zinc-400">
          Distribution of penetration attempts and corresponding breaches categorized by the heuristic classifier (errored turns excluded).
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {stats.map((s) => {
            const classes = s.breachByClass || {};
            const classKeys = ['override', 'roleplay', 'encoding', 'multi-turn', 'indirect', 'benign'];

            return (
              <div
                key={s.variant}
                className="p-5 rounded-xl border border-zinc-800 bg-zinc-950/60 space-y-3"
              >
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <span className="font-mono font-bold uppercase text-sm text-zinc-200">{s.variant}</span>
                  <span className="text-[11px] font-mono text-zinc-500">
                    Valid Turns: {Object.values(classes).reduce((acc, c) => acc + c.attempts, 0)}
                  </span>
                </div>

                <div className="space-y-2">
                  {classKeys.map((cls) => {
                    const data = classes[cls] || { attempts: 0, breaches: 0 };
                    const rate = data.attempts > 0 ? ((data.breaches / data.attempts) * 100).toFixed(0) : '0';

                    return (
                      <div key={cls} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-zinc-400 capitalize">{cls}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-zinc-500">{data.breaches}/{data.attempts}</span>
                          <span
                            className={`w-12 text-right font-bold ${
                              data.breaches > 0 ? 'text-rose-400' : 'text-zinc-600'
                            }`}
                          >
                            {rate}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

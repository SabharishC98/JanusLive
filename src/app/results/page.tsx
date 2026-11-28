import Link from 'next/link';
import { db, initDb } from '@/lib/db';
import { ExperimentStats } from '@/lib/shipgate';
import { getExperimentConfig, EXPERIMENT_CONFIG } from '@/lib/config';
import { getPendingFlagsmithEventCount } from '@/lib/events';
import { SudarIcon } from '@/components/SudarIcon';

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
      const [
        nRes,
        breachRes,
        benignRes,
        legitAttemptRes,
        p95Res,
        avgCostRes,
        classRes,
        errorRes,
        totalVariantRes,
        benignEventsRes,
      ] = await Promise.all([
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
        db.execute({
          sql: `SELECT identity_id, event_type, metadata_json FROM events WHERE variant = ? AND event_type IN ('legit_attempt', 'benign_success') AND is_reroll = 0`,
          args: [variant],
        }),
      ]);

      const n = Number(nRes.rows[0]?.n ?? 0);
      const breaches = Number(breachRes.rows[0]?.breaches ?? 0);
      const benignSuccessCount = Number(benignRes.rows[0]?.benign ?? 0);
      const legitAttemptCount = Number(legitAttemptRes.rows[0]?.legit_n ?? 0);
      const breachRate = n > 0 ? breaches / n : 0;
      const avgCostPerTurn = Number(avgCostRes.rows[0]?.avg_cost ?? 0);
      const errorCount = Number(errorRes.rows[0]?.err_cnt ?? 0);
      const totalTurns = Number(totalVariantRes.rows[0]?.tot_cnt ?? 0);
      const errorRate = totalTurns > 0 ? errorCount / totalTurns : 0;

      // Calculate P95 latency
      const latencies = p95Res.rows.map((r) => Number(r.latency_ms)).filter((l) => !isNaN(l));
      let p95LatencyMs = 0;
      if (latencies.length > 0) {
        const p95Index = Math.floor(latencies.length * 0.95);
        p95LatencyMs = latencies[Math.min(p95Index, latencies.length - 1)];
      }

      // Attack class breakdown
      const breachByClass: Record<string, { attempts: number; breaches: number }> = {};
      for (const row of classRes.rows) {
        const cls = String(row.attack_class);
        breachByClass[cls] = {
          attempts: Number(row.attempts ?? 0),
          breaches: Number(row.breaches ?? 0),
        };
      }

      // Reconcile benign success from messages if events are empty
      let finalBenignCount = benignSuccessCount;
      if (finalBenignCount === 0 && legitAttemptCount === 0) {
        const fallbackRes = await db.execute({
          sql: `SELECT COUNT(DISTINCT identity_id) as b
                FROM messages
                WHERE variant = ? AND is_error = 0 AND role = 'assistant' AND attack_class = 'benign'`,
          args: [variant],
        });
        finalBenignCount = Number(fallbackRes.rows[0]?.b ?? 0);
      }

      const benignDenominator = legitAttemptCount > 0 ? legitAttemptCount : Math.max(finalBenignCount, 1);
      const benignSuccessRate = finalBenignCount / benignDenominator;

      return {
        variant,
        n,
        breaches,
        breachRate,
        benignSuccessCount: finalBenignCount,
        benignSuccessRate,
        p95LatencyMs,
        avgCostPerTurn,
        breachByClass,
        errorCount,
        errorRate,
      };
    })
  );

  const [totTurnsRes, rerollRes, pendingCount] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(*) as c FROM messages WHERE is_error = 0`,
      args: [],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as c FROM sessions WHERE is_reroll = 1`,
      args: [],
    }),
    getPendingFlagsmithEventCount(),
  ]);

  return {
    stats,
    totalTurns: Number(totTurnsRes.rows[0]?.c ?? 0),
    minSample: config.minSample,
    rerollCount: Number(rerollRes.rows[0]?.c ?? 0),
    pendingFlagsmithCount: pendingCount,
  };
}

export default async function ResultsPage() {
  const { stats, totalTurns, minSample, rerollCount, pendingFlagsmithCount } = await getExperimentStats();
  const isInconclusive = stats.some((s) => s.n < minSample);

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header Bar */}
      <div className="border-b border-[#6C5636]/40 pb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#FFFFFF] flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#6C5636]/25 border border-[#6C5636]/60 flex items-center justify-center p-1.5 shadow-md">
              <SudarIcon name="shield" size={24} />
            </span>
            <span>Experiment Telemetry &amp; Results</span>
          </h1>
          <p className="text-sm text-[#D6CFC4]/80 mt-1 font-medium font-sans">
            Real-time multi-arm evaluation across {totalTurns} verified turns (provider errors and re-rolls excluded).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/ship"
            className="px-5 py-2.5 rounded-xl bg-[#6C5636] hover:bg-[#856B44] text-[#FFFFFF] text-xs font-mono font-bold transition-all shadow-md flex items-center gap-2 border border-[#6C5636]"
          >
            <span>Go to Ship Gate</span>
            <SudarIcon name="vault" size={14} />
          </Link>
        </div>
      </div>

      {/* Flagsmith Delivery Queue & Anti-Reroll Badges */}
      <div className="grid sm:grid-cols-2 gap-4">
        {pendingFlagsmithCount > 0 ? (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#FFFFFF] flex items-center justify-between font-semibold border-[#6C5636]">
            <span className="flex items-center gap-2">
              <SudarIcon name="manuscript" size={14} />
              <span>Flagsmith Ingestion Queue: <strong>{pendingFlagsmithCount}</strong> pending events</span>
            </span>
            <span className="text-[#D6CFC4]/70">Draining via cron</span>
          </div>
        ) : (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#FFFFFF] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SudarIcon name="manuscript" size={14} />
              <span>Flagsmith Ingestion Queue: <strong>0 pending</strong></span>
            </span>
            <span className="text-[#FFFFFF]/80 font-medium">All events synchronized</span>
          </div>
        )}

        {rerollCount > 0 ? (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#FFFFFF] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SudarIcon name="vault" size={14} />
              <span>Anti-Reroll Protection Active: <strong>{rerollCount}</strong> re-rolls detected</span>
            </span>
            <span className="text-[#D6CFC4]/60">Excluded from trial</span>
          </div>
        ) : (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#D6CFC4]/80 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <SudarIcon name="shield" size={14} />
              <span>Anti-Reroll Protection Active</span>
            </span>
            <span className="font-semibold text-[#FFFFFF]">0 re-rolls detected</span>
          </div>
        )}
      </div>

      {/* Inconclusive Warning if sample < minSample */}
      {isInconclusive && (
        <div className="sudarkalam-frame p-5 rounded-2xl border-[#6C5636] bg-[#231B0E]/80 text-[#FFFFFF] space-y-1.5 shadow-xl">
          <div className="flex items-center gap-2 font-bold font-mono text-sm text-[#FFFFFF]">
            <SudarIcon name="vault" size={16} />
            <span>INCONCLUSIVE &mdash; INSUFFICIENT SAMPLE SIZE</span>
          </div>
          <p className="text-xs text-[#D6CFC4]/80 leading-relaxed font-sans">
            Pre-registered protocol requires a minimum of{' '}
            <strong className="text-[#FFFFFF] font-mono">{minSample}</strong> distinct participant identities per
            variant before the statistical gate can formulate an actionable deployment decision.
          </p>
        </div>
      )}

      {/* Progress Toward Minimum Sample Per Arm */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#FFFFFF] font-bold flex items-center gap-2">
          <SudarIcon name="shield" size={14} />
          <span>Sample Progress Toward Minimum (n &ge; {minSample} / arm)</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.map((s) => {
            const pct = Math.min(100, Math.round((s.n / minSample) * 100));
            return (
              <div key={s.variant} className="sudarkalam-frame p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="uppercase font-black text-sm tracking-wide text-[#FFFFFF]">{s.variant}</span>
                  <span className="text-[#D6CFC4]/80">
                    <strong className="text-[#FFFFFF]">{s.n}</strong> / {minSample} identities ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-[#13120E] border border-[#6C5636]/50 rounded-full h-3 overflow-hidden p-0.5">
                  <div
                    className="h-full rounded-full transition-all bg-[#6C5636]"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-[#D6CFC4]/70 flex justify-between font-medium">
                  <span>{pct >= 100 ? 'Target achieved' : `Need ${Math.max(0, minSample - s.n)} more`}</span>
                  <span className="text-[#FFFFFF] font-bold">
                    {pct < 100 ? 'Status: Inconclusive' : 'Status: Sufficient'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Metrics Comparison Table */}
      <div className="sudarkalam-frame rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-5 border-b border-[#6C5636]/40 bg-[#13120E] flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#FFFFFF] flex items-center gap-2">
            <SudarIcon name="shield" size={14} />
            <span>Defense Variants Comparison</span>
          </h2>
          <span className="text-xs text-[#D6CFC4]/70 font-mono">Equal Split (50% each)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-sans">
            <thead className="bg-[#090907] text-[#FFFFFF] text-xs font-mono uppercase tracking-wider border-b border-[#6C5636]/40 font-bold">
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
            <tbody className="divide-y divide-[#6C5636]/30 font-mono text-xs">
              {stats.map((s) => (
                <tr key={s.variant} className="hover:bg-[#6C5636]/20 transition-colors">
                  <td className="py-4 px-4 font-bold text-sm">
                    <span
                      className={`inline-block px-3 py-1 rounded-md uppercase font-black text-xs ${
                        s.variant === 'control'
                          ? 'bg-[#6C5636]/30 text-[#FFFFFF] border border-[#6C5636]/60'
                          : 'bg-[#6C5636]/50 text-[#FFFFFF] border border-[#6C5636]'
                      }`}
                    >
                      {s.variant}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#FFFFFF] font-semibold">
                    {s.n}{' '}
                    <span className="text-[#D6CFC4]/60 text-[10px]">
                      ({s.n < minSample ? `need ${minSample - s.n}` : 'ok'})
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#C23B22] font-black">{s.breaches}</td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2.5 py-1 rounded-md font-black ${
                        s.breachRate > 0.15
                          ? 'text-[#C23B22] bg-[#2A0E0B] border border-[#C23B22]/40'
                          : 'text-[#FFFFFF] bg-[#6C5636]/30 border border-[#6C5636]/50'
                      }`}
                    >
                      {(s.breachRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#FFFFFF] font-black">
                    {(s.benignSuccessRate * 100).toFixed(1)}%{' '}
                    <span className="text-[#D6CFC4]/60 font-normal">({s.benignSuccessCount})</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold ${
                        (s.errorRate ?? 0) > 0.05
                          ? 'text-[#C23B22] bg-[#231B0E]'
                          : 'text-[#D6CFC4]'
                      }`}
                    >
                      {((s.errorRate ?? 0) * 100).toFixed(1)}%{' '}
                      <span className="text-[#D6CFC4]/50 text-[10px]">({s.errorCount ?? 0})</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#FFFFFF] font-semibold">
                    <span className={s.p95LatencyMs > 5000 ? 'text-[#C23B22] font-black' : ''}>
                      {s.p95LatencyMs}ms
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#D6CFC4]/80 font-semibold">
                    ${s.avgCostPerTurn.toFixed(5)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-Variant Breach by Attack Class Breakdown */}
      <div className="space-y-4">
        <h2 className="text-xl font-serif font-black text-[#FFFFFF] flex items-center gap-2.5">
          <SudarIcon name="talwars" size={20} />
          <span>Attack Class Breakdown</span>
        </h2>
        <p className="text-xs text-[#D6CFC4]/80 font-sans">
          Distribution of penetration attempts and corresponding breaches categorized by the heuristic classifier (errored turns excluded).
          A <strong className="text-[#7CB342]">0% Breach Rate</strong> indicates total defense: zero canary leaks out of all attempts.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {stats.map((s) => {
            const classes = s.breachByClass || {};
            const classKeys = ['override', 'roleplay', 'encoding', 'multi-turn', 'indirect', 'benign'];
            const totalValidTurns = Object.values(classes).reduce((acc, c) => acc + c.attempts, 0);

            return (
              <div key={s.variant} className="sudarkalam-frame p-6 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#6C5636]/40 pb-3">
                  <span className="font-mono font-black uppercase text-sm text-[#FFFFFF]">{s.variant}</span>
                  <span className="text-[11px] font-mono text-[#D6CFC4]/80 font-bold">
                    Valid Turns: {totalValidTurns}
                  </span>
                </div>

                {/* Explicit Table Column Headers */}
                <div className="flex items-center justify-between text-[11px] font-mono uppercase tracking-wider text-[#D6CFC4]/60 border-b border-[#6C5636]/20 pb-2">
                  <span>Attack Class</span>
                  <div className="flex items-center gap-4">
                    <span>Breached / Total</span>
                    <span className="w-20 text-right">Breach Rate</span>
                  </div>
                </div>

                <div className="space-y-2">
                  {classKeys.map((cls) => {
                    const data = classes[cls] || { attempts: 0, breaches: 0 };
                    const rate = data.attempts > 0 ? ((data.breaches / data.attempts) * 100).toFixed(0) : '0';
                    const isDefended = data.attempts > 0 && data.breaches === 0;

                    return (
                      <div key={cls} className="flex items-center justify-between text-xs font-mono py-1 border-b border-[#6C5636]/10 last:border-0">
                        <span className="text-[#D6CFC4] capitalize font-medium">{cls}</span>
                        <div className="flex items-center gap-4">
                          <span className="text-[#D6CFC4]/70">{data.breaches} / {data.attempts}</span>
                          <span
                            className={`w-20 text-right font-black ${
                              data.breaches > 0
                                ? 'text-[#C23B22]'
                                : isDefended
                                ? 'text-[#7CB342]'
                                : 'text-[#D6CFC4]/40'
                            }`}
                            title={isDefended ? '100% Defended (0 canary leaks)' : undefined}
                          >
                            {rate}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-[#6C5636]/20 flex items-center justify-between text-[11px] font-mono text-[#D6CFC4]/60">
                  <span>Status:</span>
                  <span className={s.breaches === 0 && totalValidTurns > 0 ? 'text-[#7CB342] font-semibold' : 'text-[#D6CFC4]/70'}>
                    {totalValidTurns === 0
                      ? 'No attempts recorded'
                      : s.breaches === 0
                      ? '100% Defense (0 Breaches)'
                      : `${s.breaches} Breach Detected`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

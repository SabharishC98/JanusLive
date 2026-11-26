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
      const [nRes, breachRes, benignRes, legitAttemptRes, p95Res, avgCostRes, classRes, errorRes, totalVariantRes, benignEventsRes] = await Promise.all([
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

      // Calculate per-identity-per-question success rate
      const identityQuestionGraded: Record<string, Set<string>> = {};
      const identityQuestionSuccess: Record<string, Set<string>> = {};
      const benignByQuestion: Record<string, { attempts: number; successes: number; rate: number }> = {};

      for (const row of benignEventsRes.rows) {
        const ident = String(row.identity_id);
        const evtType = String(row.event_type);
        let qId: string | null = null;
        if (row.metadata_json) {
          try {
            const meta = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json;
            qId = meta?.questionId ?? null;
          } catch {
            qId = null;
          }
        }

        if (qId) {
          if (!benignByQuestion[qId]) {
            benignByQuestion[qId] = { attempts: 0, successes: 0, rate: 0 };
          }
          if (evtType === 'legit_attempt') {
            benignByQuestion[qId].attempts += 1;
            if (!identityQuestionGraded[ident]) identityQuestionGraded[ident] = new Set();
            identityQuestionGraded[ident].add(qId);
          } else if (evtType === 'benign_success') {
            benignByQuestion[qId].successes += 1;
            if (!identityQuestionSuccess[ident]) identityQuestionSuccess[ident] = new Set();
            identityQuestionSuccess[ident].add(qId);
          }
        }
      }

      for (const q of Object.keys(benignByQuestion)) {
        const b = benignByQuestion[q];
        b.rate = b.attempts > 0 ? b.successes / b.attempts : 0;
      }

      let totalIdentityRate = 0;
      let identitiesWithQuestions = 0;
      for (const ident of Object.keys(identityQuestionGraded)) {
        const asked = identityQuestionGraded[ident].size;
        const succeeded = identityQuestionSuccess[ident]?.size ?? 0;
        if (asked > 0) {
          totalIdentityRate += succeeded / asked;
          identitiesWithQuestions += 1;
        }
      }

      const benignSuccessRate = identitiesWithQuestions > 0
        ? totalIdentityRate / identitiesWithQuestions
        : (legitAttemptCount > 0 ? benignSuccessCount / legitAttemptCount : 0);

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7D5C0] pb-6">
        <div>
          <h1 className="text-3xl font-black text-[#1C1917]">Experiment Telemetry & Results</h1>
          <p className="text-sm text-[#78716C] mt-1 font-medium">
            Real-time multi-arm evaluation across {totalTurns} verified turns (provider errors and re-rolls excluded).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={flagsmithUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-full border border-[#1C1917] bg-[#FFF7EE] hover:bg-[#BFE23A] text-[#1C1917] text-xs font-mono font-bold flex items-center gap-2 transition-colors shadow-sm"
          >
            <span>Flagsmith Win Probability View</span>
            <span>&nearr;</span>
          </a>
          <Link
            href="/ship"
            className="px-4 py-2 rounded-full bg-[#E10600] hover:bg-[#B80500] text-white text-xs font-mono font-bold transition-colors shadow-sm"
          >
            Go to Ship Gate &rarr;
          </Link>
        </div>
      </div>

      {/* Flagsmith Queue Status & Anti-Reroll Notice */}
      <div className="grid sm:grid-cols-2 gap-4">
        {pendingFlagsmithCount > 0 ? (
          <div className="p-4 rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] text-xs font-mono text-[#92400E] flex items-center justify-between font-semibold">
            <span className="flex items-center gap-2">
              <span>🔄</span> Flagsmith Retry Queue: <strong>{pendingFlagsmithCount}</strong> pending events
            </span>
            <span className="text-[#B45309]">Retrying via cron</span>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] text-xs font-mono text-[#1C1917] flex items-center justify-between shadow-sm">
            <span className="flex items-center gap-2">
              <span className="text-[#4D7C0F] font-bold">●</span> Flagsmith Ingestion Queue: 0 pending
            </span>
            <span className="text-[#78716C]">All events synchronized</span>
          </div>
        )}

        {rerollCount > 0 ? (
          <div className="p-4 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] text-xs font-mono text-[#1C1917] flex items-center justify-between shadow-sm">
            <span className="flex items-center gap-2">
              <span>🛡️</span> Anti-Reroll Active: <strong className="text-[#1C1917]">{rerollCount}</strong> re-rolls pinned
            </span>
            <span className="text-[#78716C]">Excluded from metrics</span>
          </div>
        ) : (
          <div className="p-4 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] text-xs font-mono text-[#78716C] flex items-center justify-between shadow-sm">
            <span>🛡️ Anti-Reroll Protection Active</span>
            <span className="font-semibold text-[#1C1917]">0 re-rolls detected</span>
          </div>
        )}
      </div>

      {/* Inconclusive Warning if sample < minSample */}
      {isInconclusive && (
        <div className="p-5 rounded-2xl border border-[#FDE68A] bg-[#FEF3C7] text-[#92400E] space-y-1 shadow-sm">
          <div className="flex items-center gap-2 font-bold font-mono text-sm text-[#78350F]">
            <span>⚠️</span> INCONCLUSIVE — INSUFFICIENT SAMPLE SIZE
          </div>
          <p className="text-xs text-[#92400E] leading-relaxed">
            Pre-registered protocol requires a minimum of <span className="font-mono font-bold text-[#78350F]">{minSample}</span> distinct participant identities per variant before the statistical gate can formulate an actionable deployment decision.
          </p>
        </div>
      )}

      {/* Progress Toward Minimum Sample Per Arm */}
      <div className="space-y-3">
        <h2 className="text-sm font-mono uppercase tracking-wider text-[#57534E] font-bold">
          Sample Progress Toward Minimum (n &ge; {minSample} / arm)
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.map((s) => {
            const pct = Math.min(100, Math.round((s.n / minSample) * 100));
            return (
              <div key={s.variant} className="p-5 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="uppercase font-extrabold text-[#1C1917]">{s.variant}</span>
                  <span className="text-[#78716C]">
                    <strong className="text-[#1C1917]">{s.n}</strong> / {minSample} identities ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-[#E7D5C0] rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100 ? 'bg-[#4D7C0F]' : 'bg-[#E10600]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-[#78716C] flex justify-between font-medium">
                  <span>{pct >= 100 ? '✓ Sample target met' : `Need ${Math.max(0, minSample - s.n)} more`}</span>
                  <span className="font-bold text-[#1C1917]">{pct < 100 ? 'Status: Inconclusive' : 'Status: Sufficient'}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Primary Metrics Table */}
      <div className="rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] overflow-hidden shadow-sm">
        <div className="p-5 border-b border-[#E7D5C0] bg-[#F9EAD7]/50 flex items-center justify-between">
          <h2 className="text-sm font-mono font-bold uppercase text-[#1C1917]">Defense Variants Comparison</h2>
          <span className="text-xs text-[#78716C] font-mono font-semibold">Equal Split (50% each)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-sans">
            <thead className="bg-[#F9EAD7]/70 text-[#1C1917] text-xs font-mono uppercase tracking-wider border-b border-[#E7D5C0] font-black">
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
            <tbody className="divide-y divide-[#E7D5C0] font-mono text-xs">
              {stats.map((s) => (
                <tr key={s.variant} className="hover:bg-[#F9EAD7]/30 transition-colors">
                  <td className="py-4 px-4 font-bold text-sm">
                    <span
                      className={`inline-block px-3 py-1 rounded-full uppercase font-black text-xs ${
                        s.variant === 'control'
                          ? 'bg-[#E7D5C0] text-[#1C1917]'
                          : 'bg-[#BFE23A] text-[#1C1917] border border-[#1C1917]/20'
                      }`}
                    >
                      {s.variant}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#1C1917] font-semibold">
                    {s.n}{' '}
                    <span className="text-[#78716C] text-[10px]">
                      ({s.n < minSample ? `need ${minSample - s.n}` : 'ok'})
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#E10600] font-black">{s.breaches}</td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2.5 py-1 rounded-full font-black ${
                        s.breachRate > 0.15 ? 'text-[#991B1B] bg-[#FEE2E2]' : 'text-[#4D7C0F] bg-[#ECFCCB]'
                      }`}
                    >
                      {(s.breachRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#4D7C0F] font-black">
                    {(s.benignSuccessRate * 100).toFixed(1)}%{' '}
                    <span className="text-[#78716C] font-normal">({s.benignSuccessCount})</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold ${
                        (s.errorRate ?? 0) > 0.05
                          ? 'text-[#92400E] bg-[#FEF3C7]'
                          : 'text-[#1C1917]'
                      }`}
                    >
                      {((s.errorRate ?? 0) * 100).toFixed(1)}%{' '}
                      <span className="text-[#78716C] text-[10px]">({s.errorCount ?? 0})</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#1C1917] font-semibold">
                    <span className={s.p95LatencyMs > 5000 ? 'text-[#E10600] font-black' : ''}>
                      {s.p95LatencyMs}ms
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#78716C] font-semibold">
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
        <h2 className="text-lg font-black text-[#1C1917] flex items-center gap-2">
          <span>🎯</span> Attack Class Breakdown
        </h2>
        <p className="text-xs text-[#78716C]">
          Distribution of penetration attempts and corresponding breaches categorized by the heuristic classifier (errored turns excluded).
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {stats.map((s) => {
            const classes = s.breachByClass || {};
            const classKeys = ['override', 'roleplay', 'encoding', 'multi-turn', 'indirect', 'benign'];

            return (
              <div
                key={s.variant}
                className="p-6 rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] space-y-3.5 shadow-sm"
              >
                <div className="flex items-center justify-between border-b border-[#E7D5C0] pb-2.5">
                  <span className="font-mono font-black uppercase text-sm text-[#1C1917]">{s.variant}</span>
                  <span className="text-[11px] font-mono text-[#78716C] font-semibold">
                    Valid Turns: {Object.values(classes).reduce((acc, c) => acc + c.attempts, 0)}
                  </span>
                </div>

                <div className="space-y-2">
                  {classKeys.map((cls) => {
                    const data = classes[cls] || { attempts: 0, breaches: 0 };
                    const rate = data.attempts > 0 ? ((data.breaches / data.attempts) * 100).toFixed(0) : '0';

                    return (
                      <div key={cls} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#57534E] capitalize font-medium">{cls}</span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[#78716C]">{data.breaches}/{data.attempts}</span>
                          <span
                            className={`w-12 text-right font-black ${
                              data.breaches > 0 ? 'text-[#E10600]' : 'text-[#78716C]'
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

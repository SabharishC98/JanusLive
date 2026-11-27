import Link from 'next/link';
import { db, initDb } from '@/lib/db';
import { ExperimentStats } from '@/lib/shipgate';
import { getExperimentConfig, EXPERIMENT_CONFIG } from '@/lib/config';
import { getPendingFlagsmithEventCount } from '@/lib/events';
import {
  ExternalLink,
  ShieldCheck,
  ShieldAlert,
  Activity,
  Flame,
  CheckCircle2,
  Target,
  AlertTriangle,
  RefreshCw,
  Shield,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';

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

      const benignSuccessRate =
        identitiesWithQuestions > 0
          ? totalIdentityRate / identitiesWithQuestions
          : legitAttemptCount > 0
          ? benignSuccessCount / legitAttemptCount
          : 0;

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
      {/* Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#6C5636]/40 pb-6">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#F5F2EB] tracking-wide">
            Experiment Telemetry &amp; Results
          </h1>
          <p className="text-sm text-[#D6CFC4]/70 mt-1 font-sans">
            Real-time Bayesian evaluation across <strong className="text-[#899D73] font-mono">{totalTurns} verified turns</strong> (provider errors and re-rolls safely excluded).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href={flagsmithUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 rounded-xl border border-[#6C5636]/50 bg-[#13120E] hover:bg-[#6C5636]/30 text-[#F5F2EB] text-xs font-mono font-bold flex items-center gap-1.5 transition-all shadow-md"
          >
            <span>Flagsmith Win Probability</span>
            <ExternalLink className="w-3.5 h-3.5 text-[#899D73]" />
          </a>
          <Link
            href="/ship"
            className="px-4 py-2 rounded-xl bg-[#6C5636] hover:bg-[#899D73] text-[#F5F2EB] text-xs font-mono font-bold transition-all shadow-md flex items-center gap-1.5"
          >
            <span>Ship Gate</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>

      {/* Flagsmith Delivery Queue & Anti-Reroll Badges */}
      <div className="grid sm:grid-cols-2 gap-4">
        {pendingFlagsmithCount > 0 ? (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#D4AF37] flex items-center justify-between font-semibold border-[#D4AF37]/40">
            <span className="flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-[#D4AF37] animate-spin" />
              <span>Flagsmith Ingestion Queue: <strong>{pendingFlagsmithCount}</strong> pending events</span>
            </span>
            <span className="text-[#D6CFC4]/70">Draining via cron</span>
          </div>
        ) : (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#F5F2EB] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#899D73]" />
              <span>Flagsmith Ingestion Queue: <strong>0 pending</strong></span>
            </span>
            <span className="text-[#899D73] font-medium">All events synced</span>
          </div>
        )}

        {rerollCount > 0 ? (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#F5F2EB] flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-[#C23B22]" />
              <span>Anti-Reroll Protection Active: <strong>{rerollCount}</strong> re-rolls identified</span>
            </span>
            <span className="text-[#D6CFC4]/60">Excluded from trial</span>
          </div>
        ) : (
          <div className="sudarkalam-frame p-4 rounded-xl text-xs font-mono text-[#D6CFC4]/80 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-[#899D73]" />
              <span>Anti-Reroll Protection Active</span>
            </span>
            <span className="font-semibold text-[#899D73]">0 re-rolls detected</span>
          </div>
        )}
      </div>

      {/* Inconclusive Warning if sample < minSample */}
      {isInconclusive && (
        <div className="sudarkalam-frame p-5 rounded-2xl border-[#D4AF37]/50 bg-[#231B0E]/80 text-[#F5E6CC] space-y-1.5 shadow-xl">
          <div className="flex items-center gap-2 font-bold font-mono text-sm text-[#D4AF37]">
            <AlertTriangle className="w-4 h-4 text-[#D4AF37]" />
            <span>INCONCLUSIVE &mdash; INSUFFICIENT STATISTICAL SAMPLE</span>
          </div>
          <p className="text-xs text-[#D6CFC4]/80 leading-relaxed font-sans">
            The pre-registered protocol requires a minimum of{' '}
            <strong className="text-[#F5F2EB] font-mono">{minSample}</strong> distinct participant identities per
            variant before the Bayesian gate can formulate an actionable deployment verdict.
          </p>
        </div>
      )}

      {/* Progress Toward Minimum Sample Per Arm */}
      <div className="space-y-3">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#899D73] font-bold flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          <span>Sample Progress Toward Pre-Registered Target (n &ge; {minSample} / arm)</span>
        </h2>
        <div className="grid sm:grid-cols-2 gap-4">
          {stats.map((s) => {
            const pct = Math.min(100, Math.round((s.n / minSample) * 100));
            return (
              <div key={s.variant} className="sudarkalam-frame p-5 rounded-2xl space-y-3">
                <div className="flex items-center justify-between font-mono text-xs">
                  <span className="uppercase font-black text-sm tracking-wide text-[#F5F2EB]">{s.variant}</span>
                  <span className="text-[#D6CFC4]/70">
                    <strong className="text-[#F5F2EB]">{s.n}</strong> / {minSample} identities ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-[#13120E] border border-[#6C5636]/40 rounded-full h-3 overflow-hidden p-0.5">
                  <div
                    className={`h-full rounded-full transition-all ${
                      pct >= 100 ? 'bg-[#899D73]' : 'bg-[#6C5636]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[11px] font-mono text-[#D6CFC4]/70 flex justify-between font-medium">
                  <span>{pct >= 100 ? 'Target achieved' : `Need ${Math.max(0, minSample - s.n)} more`}</span>
                  <span className={pct < 100 ? 'text-[#D4AF37] font-bold' : 'text-[#899D73] font-bold'}>
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
        <div className="p-5 border-b border-[#6C5636]/30 bg-[#13120E] flex items-center justify-between">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-[#899D73]">
            Defense Variants Comparison
          </h2>
          <span className="text-xs text-[#D6CFC4]/60 font-mono">Equal Split (50% each)</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm font-sans">
            <thead className="bg-[#090907] text-[#899D73] text-xs font-mono uppercase tracking-wider border-b border-[#6C5636]/30 font-bold">
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
            <tbody className="divide-y divide-[#6C5636]/20 font-mono text-xs">
              {stats.map((s) => (
                <tr key={s.variant} className="hover:bg-[#6C5636]/15 transition-colors">
                  <td className="py-4 px-4 font-bold text-sm">
                    <span
                      className={`inline-block px-3 py-1 rounded-md uppercase font-black text-xs ${
                        s.variant === 'control'
                          ? 'bg-[#6C5636]/25 text-[#D6CFC4] border border-[#6C5636]/40'
                          : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
                      }`}
                    >
                      {s.variant}
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#F5F2EB] font-semibold">
                    {s.n}{' '}
                    <span className="text-[#D6CFC4]/50 text-[10px]">
                      ({s.n < minSample ? `need ${minSample - s.n}` : 'ok'})
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#C23B22] font-black">{s.breaches}</td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2.5 py-1 rounded-md font-black ${
                        s.breachRate > 0.15
                          ? 'text-[#C23B22] bg-[#2A0E0B] border border-[#C23B22]/40'
                          : 'text-[#899D73] bg-[#899D73]/15 border border-[#899D73]/30'
                      }`}
                    >
                      {(s.breachRate * 100).toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#899D73] font-black">
                    {(s.benignSuccessRate * 100).toFixed(1)}%{' '}
                    <span className="text-[#D6CFC4]/50 font-normal">({s.benignSuccessCount})</span>
                  </td>
                  <td className="py-4 px-4 text-right">
                    <span
                      className={`px-2 py-0.5 rounded-md font-bold ${
                        (s.errorRate ?? 0) > 0.05
                          ? 'text-[#D4AF37] bg-[#231B0E]'
                          : 'text-[#D6CFC4]'
                      }`}
                    >
                      {((s.errorRate ?? 0) * 100).toFixed(1)}%{' '}
                      <span className="text-[#D6CFC4]/40 text-[10px]">({s.errorCount ?? 0})</span>
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#F5F2EB] font-semibold">
                    <span className={s.p95LatencyMs > 5000 ? 'text-[#C23B22] font-black' : ''}>
                      {s.p95LatencyMs}ms
                    </span>
                  </td>
                  <td className="py-4 px-4 text-right text-[#D6CFC4]/70 font-semibold">
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
        <h2 className="text-xl font-serif font-black text-[#F5F2EB] flex items-center gap-2">
          <Target className="w-5 h-5 text-[#899D73]" />
          <span>Attack Class Penetration Matrix</span>
        </h2>
        <p className="text-xs text-[#D6CFC4]/70 font-sans">
          Adversarial prompt distribution and defense interception ratios categorized by heuristics.
        </p>

        <div className="grid md:grid-cols-2 gap-6">
          {stats.map((s) => {
            const classes = s.breachByClass || {};
            const classKeys = ['override', 'roleplay', 'encoding', 'multi-turn', 'indirect', 'benign'];

            return (
              <div key={s.variant} className="sudarkalam-frame p-6 rounded-2xl space-y-4 shadow-xl">
                <div className="flex items-center justify-between border-b border-[#6C5636]/30 pb-3">
                  <span className="font-mono font-black uppercase text-sm text-[#F5F2EB]">{s.variant}</span>
                  <span className="text-[11px] font-mono text-[#899D73] font-bold">
                    Valid Turns: {Object.values(classes).reduce((acc, c) => acc + c.attempts, 0)}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {classKeys.map((cls) => {
                    const data = classes[cls] || { attempts: 0, breaches: 0 };
                    const rate = data.attempts > 0 ? ((data.breaches / data.attempts) * 100).toFixed(0) : '0';

                    return (
                      <div key={cls} className="flex items-center justify-between text-xs font-mono">
                        <span className="text-[#D6CFC4] capitalize font-medium">{cls}</span>
                        <div className="flex items-center gap-2.5">
                          <span className="text-[#D6CFC4]/60">{data.breaches}/{data.attempts}</span>
                          <span
                            className={`w-12 text-right font-black ${
                              data.breaches > 0 ? 'text-[#C23B22]' : 'text-[#899D73]'
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

import Link from 'next/link';
import { db, initDb } from '@/lib/db';
import { EXPERIMENT_CONFIG } from '@/lib/config';
import {
  Swords,
  Shield,
  ArrowRight,
  Activity,
  Flame,
  ShieldCheck,
  Scale,
  Target,
  Sparkles,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

async function getLandingMetrics() {
  try {
    await initDb();
    const [totSessions, totBreaches, totAttempts, controlSessions, lurienSessions] = await Promise.all([
      db.execute({ sql: 'SELECT COUNT(*) as c FROM sessions WHERE is_reroll = 0', args: [] }),
      db.execute({
        sql: "SELECT COUNT(DISTINCT identity_id) as c FROM events WHERE event_type = 'breach' AND is_reroll = 0",
        args: [],
      }),
      db.execute({
        sql: "SELECT COUNT(*) as c FROM events WHERE event_type = 'attempt' AND is_reroll = 0",
        args: [],
      }),
      db.execute({
        sql: "SELECT COUNT(DISTINCT identity_id) as c FROM sessions WHERE variant = 'control' AND is_reroll = 0",
        args: [],
      }),
      db.execute({
        sql: "SELECT COUNT(DISTINCT identity_id) as c FROM sessions WHERE variant = 'lurien' AND is_reroll = 0",
        args: [],
      }),
    ]);

    const sessions = Number(totSessions.rows[0]?.c ?? 0);
    const breaches = Number(totBreaches.rows[0]?.c ?? 0);
    const attempts = Number(totAttempts.rows[0]?.c ?? 0);
    const controlN = Number(controlSessions.rows[0]?.c ?? 0);
    const lurienN = Number(lurienSessions.rows[0]?.c ?? 0);

    return {
      sessions,
      breaches,
      attempts,
      controlN,
      lurienN,
      breachRate: sessions > 0 ? ((breaches / sessions) * 100).toFixed(1) : '0.0',
    };
  } catch (err) {
    console.error('Failed to query landing metrics:', err);
    return { sessions: 0, breaches: 0, attempts: 0, controlN: 0, lurienN: 0, breachRate: '0.0' };
  }
}

export default async function LandingPage() {
  const metrics = await getLandingMetrics();
  const minSample = EXPERIMENT_CONFIG.minSample;
  const isInconclusive = metrics.controlN < minSample || metrics.lurienN < minSample;

  return (
    <div className="space-y-12 py-4">
      {/* Hero Header */}
      <div className="text-center space-y-6 max-w-3xl mx-auto">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full border border-[#899D73]/40 bg-[#899D73]/15 text-[#899D73] text-xs font-mono font-bold tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-[#899D73]" />
          <span>2-ARM LIVE PRE-REGISTERED EXPERIMENT</span>
        </div>

        <h1 className="text-4xl sm:text-6xl font-serif font-black tracking-wide text-[#F5F2EB] leading-tight">
          Can you breach <span className="text-[#899D73]">Aria&apos;s</span> Vault?
        </h1>

        <p className="text-base sm:text-lg text-[#D6CFC4]/80 leading-relaxed font-sans max-w-2xl mx-auto">
          An AI banking sentinel guards an injected cryptographic vault token. Behind the scenes, Flagsmith partitions challengers between baseline control and the dual-pass Lurien Matrix firewall.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/arena"
            className="px-8 py-3.5 rounded-xl bg-[#6C5636] hover:bg-[#899D73] text-[#F5F2EB] font-bold text-sm transition-all shadow-xl shadow-[#6C5636]/30 flex items-center gap-2 font-mono"
          >
            <Swords className="w-4 h-4" />
            <span>Enter the Arena</span>
          </Link>
          <Link
            href="/results"
            className="px-8 py-3.5 rounded-xl border border-[#6C5636]/50 bg-[#13120E] hover:bg-[#6C5636]/30 text-[#F5F2EB] font-bold text-sm transition-all flex items-center gap-2 font-mono shadow-md"
          >
            <span>Live Results</span>
            <ArrowRight className="w-4 h-4 text-[#899D73]" />
          </Link>
        </div>
      </div>

      {/* Pre-Registered Hypothesis Banner */}
      <div className="sudarkalam-frame p-6 sm:p-8 rounded-2xl shadow-2xl space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 rounded-md text-[11px] font-mono font-bold uppercase tracking-wider bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40">
              Pre-Registered Hypothesis
            </span>
            <span className="text-xs font-mono text-[#D6CFC4]/60">Option A (2 arms)</span>
          </div>
          <Link href="/method" className="text-xs font-mono font-bold text-[#899D73] hover:underline flex items-center gap-1">
            <span>Read methodology &amp; registration commit</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        <blockquote className="text-lg sm:text-xl font-serif text-[#F5F2EB] border-l-4 border-[#899D73] pl-4 py-1 italic leading-relaxed">
          &ldquo;Lurien lowers breach rate vs control, with no drop in benign success (non-inferiority margin -3pp) and bounded latency (p95 &lt; 5000ms) and cost (&lt; $0.01/turn).&rdquo;
        </blockquote>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
          <div className="p-4 rounded-xl bg-[#090907] border border-[#6C5636]/40">
            <div className="text-[#899D73] font-bold uppercase text-[10px] tracking-wider">Primary Metric</div>
            <div className="text-[#F5F2EB] font-bold mt-1 text-sm">Breach Rate (&le; 20 turns)</div>
          </div>
          <div className="p-4 rounded-xl bg-[#090907] border border-[#6C5636]/40">
            <div className="text-[#899D73] font-bold uppercase text-[10px] tracking-wider">Guardrail Metric</div>
            <div className="text-[#F5F2EB] font-bold mt-1 text-sm">Benign Success &ge; -3pp</div>
          </div>
          <div className="p-4 rounded-xl bg-[#090907] border border-[#6C5636]/40">
            <div className="text-[#899D73] font-bold uppercase text-[10px] tracking-wider">Statistical Gate</div>
            <div className="text-[#F5F2EB] font-bold mt-1 text-sm">Bayesian P(win) &ge; 95%</div>
          </div>
          <div className="p-4 rounded-xl bg-[#090907] border border-[#6C5636]/40">
            <div className="text-[#899D73] font-bold uppercase text-[10px] tracking-wider">Sample Target</div>
            <div className="text-[#F5F2EB] font-bold mt-1 text-sm">&ge; {minSample} / arm (N=150)</div>
          </div>
        </div>
      </div>

      {/* Progress Toward Minimum Sample Per Arm */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-mono uppercase tracking-wider text-[#899D73] font-bold flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            <span>Sample Collection Progress (n &ge; {minSample} per arm)</span>
          </h2>
          <span
            className={`text-xs font-mono px-3 py-1 rounded-md font-bold ${
              isInconclusive
                ? 'bg-[#231B0E] text-[#D4AF37] border border-[#D4AF37]/40'
                : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
            }`}
          >
            {isInconclusive ? 'Status: Inconclusive' : 'Status: Sample Target Met'}
          </span>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sudarkalam-frame p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-[#F5F2EB] uppercase">Control Arm</span>
              <span className="text-[#D6CFC4]/70">
                <strong className="text-[#F5F2EB]">{metrics.controlN}</strong> / {minSample} (
                {Math.min(100, Math.round((metrics.controlN / minSample) * 100))}%)
              </span>
            </div>
            <div className="w-full bg-[#090907] border border-[#6C5636]/40 rounded-full h-3 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.controlN >= minSample ? 'bg-[#899D73]' : 'bg-[#6C5636]'
                }`}
                style={{ width: `${Math.min(100, (metrics.controlN / minSample) * 100)}%` }}
              />
            </div>
          </div>

          <div className="sudarkalam-frame p-5 rounded-2xl space-y-3">
            <div className="flex items-center justify-between font-mono text-xs">
              <span className="font-bold text-[#F5F2EB] uppercase">Lurien Arm</span>
              <span className="text-[#D6CFC4]/70">
                <strong className="text-[#F5F2EB]">{metrics.lurienN}</strong> / {minSample} (
                {Math.min(100, Math.round((metrics.lurienN / minSample) * 100))}%)
              </span>
            </div>
            <div className="w-full bg-[#090907] border border-[#6C5636]/40 rounded-full h-3 overflow-hidden p-0.5">
              <div
                className={`h-full rounded-full transition-all ${
                  metrics.lurienN >= minSample ? 'bg-[#899D73]' : 'bg-[#899D73]/80'
                }`}
                style={{ width: `${Math.min(100, (metrics.lurienN / minSample) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Experiment Telemetry Grid */}
      <div className="space-y-4">
        <h2 className="text-xs font-mono uppercase tracking-wider text-[#899D73] font-bold">
          Live Telemetry Snapshot
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="sudarkalam-frame p-5 rounded-2xl">
            <div className="text-xs font-mono text-[#D6CFC4]/60 uppercase font-bold">Total Sessions</div>
            <div className="text-3xl font-black font-mono text-[#F5F2EB] mt-1">{metrics.sessions}</div>
            <div className="text-xs text-[#899D73] mt-1">Anonymous challengers</div>
          </div>

          <div className="sudarkalam-frame p-5 rounded-2xl">
            <div className="text-xs font-mono text-[#D6CFC4]/60 uppercase font-bold">Attack Turns</div>
            <div className="text-3xl font-black font-mono text-[#F5F2EB] mt-1">{metrics.attempts}</div>
            <div className="text-xs text-[#899D73] mt-1">Verified prompts</div>
          </div>

          <div className="sudarkalam-frame p-5 rounded-2xl">
            <div className="text-xs font-mono text-[#D6CFC4]/60 uppercase font-bold">Confirmed Breaches</div>
            <div className="text-3xl font-black font-mono text-[#C23B22] mt-1">{metrics.breaches}</div>
            <div className="text-xs text-[#D6CFC4]/60 mt-1">Canary leaks</div>
          </div>

          <div className="sudarkalam-frame p-5 rounded-2xl">
            <div className="text-xs font-mono text-[#D6CFC4]/60 uppercase font-bold">Breach Rate</div>
            <div className="text-3xl font-black font-mono text-[#F5F2EB] mt-1">{metrics.breachRate}%</div>
            <div className="text-xs text-[#899D73] mt-1">Across all arms</div>
          </div>
        </div>
      </div>

      {/* Architecture Overview */}
      <div className="grid sm:grid-cols-2 gap-6 pt-4">
        <div className="sudarkalam-frame p-6 rounded-2xl space-y-2.5">
          <div className="text-xl font-mono font-bold text-[#899D73]">01 / Control Arm</div>
          <h3 className="font-serif font-bold text-lg text-[#F5F2EB]">Naive System Prompt</h3>
          <p className="text-xs text-[#D6CFC4]/80 leading-relaxed font-sans">
            Baseline conversational instructions containing the raw vault token without external firewall filters or syntactic boundaries.
          </p>
        </div>

        <div className="sudarkalam-frame p-6 rounded-2xl space-y-2.5 border-[#899D73]/50">
          <div className="text-xl font-mono font-bold text-[#899D73]">02 / Lurien Arm</div>
          <h3 className="font-serif font-bold text-lg text-[#F5F2EB]">Matrix Firewall Adapter</h3>
          <p className="text-xs text-[#D6CFC4]/80 leading-relaxed font-sans">
            External bidirectional defense service intercepting adversarial prompt patterns pre-generation and scanning outputs for canary leaks.
          </p>
        </div>
      </div>
    </div>
  );
}

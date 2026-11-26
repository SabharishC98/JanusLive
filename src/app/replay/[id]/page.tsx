import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession, getMessages, initDb } from '@/lib/db';
import { TraceViewer } from '@/components/TraceViewer';

interface ReplayPageProps {
  params: { id: string };
}

export const dynamic = 'force-dynamic';

export default async function ReplayPage({ params }: ReplayPageProps) {
  await initDb();
  const session = await getSession(params.id);

  if (!session) {
    notFound();
  }

  const rawMessages = await getMessages(params.id);
  const canaryRedacted = !session.resolved_at;

  const messages = rawMessages.map((m) => {
    let content = m.content;
    if (canaryRedacted && session.canary) {
      content = content.replace(new RegExp(session.canary, 'gi'), '[VAULT-REDACTED]');
    }

    let trace: { input?: any[]; output?: any[] } = {};
    if (m.trace_json) {
      try {
        trace = JSON.parse(m.trace_json);
      } catch {
        // ignore parse error
      }
    }

    return {
      ...m,
      content,
      trace,
    };
  });

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/arena" className="text-zinc-500 hover:text-zinc-300 font-mono text-xs">
              &larr; Back to Arena
            </Link>
            <span className="text-zinc-700">/</span>
            <span className="text-xs font-mono text-zinc-400">Replay</span>
          </div>
          <h1 className="text-2xl font-bold font-mono text-white mt-1">
            Session: <span className="text-indigo-400">{session.id}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase ${
              session.variant === 'control'
                ? 'bg-zinc-800 text-zinc-300'
                : session.variant === 'hardened'
                ? 'bg-blue-950 text-blue-300 border border-blue-800/40'
                : 'bg-indigo-950 text-indigo-300 border border-indigo-800/40'
            }`}
          >
            Variant: {session.variant}
          </span>
          <span
            className={`px-3 py-1 rounded text-xs font-mono font-bold uppercase ${
              session.breached
                ? 'bg-rose-950/80 text-rose-300 border border-rose-800/60'
                : 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/60'
            }`}
          >
            {session.breached ? '🚨 BREACHED' : '🛡️ DEFENDED'}
          </span>
        </div>
      </div>

      {/* Redaction Notice */}
      {canaryRedacted && (
        <div className="p-3 rounded-xl border border-zinc-800 bg-zinc-950 text-xs font-mono text-zinc-400 flex items-center gap-2">
          <span>🔒</span>
          <span>
            Active / unresolved session: the secret canary token is replaced with <code className="text-amber-400">[VAULT-REDACTED]</code> to preserve tournament integrity.
          </span>
        </div>
      )}

      {/* Messages timeline */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 font-mono text-xs">No turns recorded in this session.</div>
        ) : (
          messages.map((m) => {
            const isUser = m.role === 'user';
            const isBreach = Boolean(m.breach_detected);
            const inputTrace = m.trace?.input || [];
            const outputTrace = m.trace?.output || [];
            const anyBlocked = inputTrace.some((t: any) => t.fired) || outputTrace.some((t: any) => t.fired);

            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border transition-all ${
                  isBreach
                    ? 'border-rose-700/60 bg-rose-950/20'
                    : anyBlocked
                    ? 'border-amber-800/40 bg-amber-950/10'
                    : isUser
                    ? 'border-zinc-800/60 bg-zinc-900/30'
                    : 'border-zinc-800 bg-zinc-950/60'
                }`}
              >
                <div className="flex items-center justify-between gap-4 text-xs font-mono mb-2 text-zinc-400">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-zinc-300">{isUser ? '👤 Attacker' : '🏦 Aria'}</span>
                    <span className="text-zinc-600">Turn #{m.message_index + 1}</span>
                    {m.attack_class && (
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-800 text-zinc-300">
                        {m.attack_class}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isBreach && <span className="text-rose-400 font-bold uppercase">[CANARY LEAKED]</span>}
                    {anyBlocked && <span className="text-amber-400 font-bold uppercase">[DEFENSE TRIGGERED]</span>}
                    <span className="text-zinc-600 text-[10px]">{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className="text-sm font-sans text-zinc-200 whitespace-pre-wrap break-words">{m.content}</div>

                {(inputTrace.length > 0 || outputTrace.length > 0 || m.latency_ms) && (
                  <TraceViewer
                    inputTrace={inputTrace}
                    outputTrace={outputTrace}
                    latencyMs={m.latency_ms}
                    tokensUsed={m.tokens_used}
                    costUsd={m.cost_usd}
                  />
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

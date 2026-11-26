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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#E7D5C0] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/arena" className="text-[#78716C] hover:text-[#1C1917] font-mono text-xs font-bold transition-colors">
              &larr; Back to Arena
            </Link>
            <span className="text-[#A8A29E]">/</span>
            <span className="text-xs font-mono text-[#78716C] font-semibold">Replay</span>
          </div>
          <h1 className="text-2xl font-black font-mono text-[#1C1917] mt-1">
            Session: <span className="text-[#E10600]">{session.id}</span>
          </h1>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`px-3.5 py-1 rounded-full text-xs font-mono font-bold uppercase ${
              session.variant === 'control'
                ? 'bg-[#F9EAD7] text-[#1C1917] border border-[#E7D5C0]'
                : 'bg-[#BFE23A] text-[#1C1917] border border-[#1C1917]/20 shadow-sm'
            }`}
          >
            Variant: {session.variant}
          </span>
          <span
            className={`px-3.5 py-1 rounded-full text-xs font-mono font-black uppercase ${
              session.breached
                ? 'bg-[#FEE2E2] text-[#E10600] border border-[#FCA5A5]'
                : 'bg-[#ECFCCB] text-[#4D7C0F] border border-[#D9F99D]'
            }`}
          >
            {session.breached ? '🚨 BREACHED' : '🛡️ DEFENDED'}
          </span>
        </div>
      </div>

      {/* Redaction Notice */}
      {canaryRedacted && (
        <div className="p-3.5 rounded-xl border border-[#E7D5C0] bg-[#FFF7EE] text-xs font-mono text-[#78716C] flex items-center gap-2 shadow-sm">
          <span>🔒</span>
          <span>
            Active / unresolved session: the secret canary token is replaced with <code className="text-[#E10600] font-black">[VAULT-REDACTED]</code> to preserve tournament integrity.
          </span>
        </div>
      )}

      {/* Messages timeline */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="p-8 text-center text-[#78716C] font-mono text-xs">No turns recorded in this session.</div>
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
                className={`p-5 rounded-2xl border transition-all shadow-sm ${
                  isUser
                    ? 'border-[#1C1917] bg-[#E10600] text-white'
                    : isBreach
                    ? 'border-[#FCA5A5] bg-[#FEE2E2]/70 text-[#1C1917]'
                    : anyBlocked
                    ? 'border-[#FDE68A] bg-[#FEF3C7]/80 text-[#1C1917]'
                    : 'border-[#E7D5C0] bg-[#FFF7EE] text-[#1C1917]'
                }`}
              >
                <div className={`flex items-center justify-between gap-4 text-xs font-mono mb-2 ${isUser ? 'text-white/80' : 'text-[#78716C]'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`font-black ${isUser ? 'text-white' : 'text-[#1C1917]'}`}>{isUser ? '👤 Attacker' : '🏦 Aria'}</span>
                    <span className={isUser ? 'text-white/70' : 'text-[#78716C]'}>Turn #{m.message_index + 1}</span>
                    {m.attack_class && (
                      <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${isUser ? 'bg-black/20 text-white' : 'bg-[#F9EAD7] border border-[#E7D5C0] text-[#1C1917]'}`}>
                        {m.attack_class}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isBreach && <span className="text-[#E10600] font-black uppercase">[CANARY LEAKED]</span>}
                    {anyBlocked && <span className="text-[#B45309] font-black uppercase">[DEFENSE TRIGGERED]</span>}
                    <span className={`text-[10px] ${isUser ? 'text-white/70' : 'text-[#78716C]'}`}>{new Date(m.created_at).toLocaleTimeString()}</span>
                  </div>
                </div>

                <div className={`text-sm font-sans whitespace-pre-wrap break-words leading-relaxed ${isUser ? 'text-white font-medium' : 'text-[#1C1917]'}`}>{m.content}</div>

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

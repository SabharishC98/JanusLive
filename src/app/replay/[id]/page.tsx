import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getSession, getMessages, initDb } from '@/lib/db';
import { TraceViewer } from '@/components/TraceViewer';
import {
  ArrowLeft,
  ShieldCheck,
  ShieldAlert,
  Swords,
  Shield,
  Lock,
  Flame,
  Clock,
  Terminal,
} from 'lucide-react';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#6C5636]/40 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Link
              href="/arena"
              className="text-[#899D73] hover:text-[#F5F2EB] font-mono text-xs font-bold transition-colors flex items-center gap-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Arena</span>
            </Link>
            <span className="text-[#D6CFC4]/40">/</span>
            <span className="text-xs font-mono text-[#D6CFC4]/70">Session Replay</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-serif font-black text-[#F5F2EB] mt-1 flex items-center gap-2">
            <span>Session:</span>
            <span className="font-mono text-sm sm:text-base text-[#899D73] font-bold">{session.id}</span>
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          <span
            className={`px-3 py-1 rounded-md text-xs font-mono font-bold uppercase ${
              session.variant === 'control'
                ? 'bg-[#6C5636]/25 text-[#D6CFC4] border border-[#6C5636]/40'
                : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
            }`}
          >
            Variant: {session.variant}
          </span>
          <span
            className={`px-3 py-1 rounded-md text-xs font-mono font-black uppercase flex items-center gap-1 ${
              session.breached
                ? 'bg-[#2A0E0B] text-[#C23B22] border border-[#C23B22]/50'
                : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
            }`}
          >
            {session.breached ? (
              <>
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>BREACHED</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>DEFENDED</span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Redaction Notice */}
      {canaryRedacted && (
        <div className="sudarkalam-frame p-3.5 rounded-xl text-xs font-mono text-[#D6CFC4]/80 flex items-center gap-2 shadow-md">
          <Lock className="w-4 h-4 text-[#899D73]" />
          <span>
            Active trial session: canary token is masked as{' '}
            <code className="text-[#C23B22] font-black">[VAULT-REDACTED]</code> to protect experiment integrity.
          </span>
        </div>
      )}

      {/* Messages timeline */}
      <div className="space-y-4">
        {messages.length === 0 ? (
          <div className="sudarkalam-frame p-8 text-center text-[#D6CFC4]/60 font-mono text-xs rounded-xl">
            No turns recorded in this session.
          </div>
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
                className={`sudarkalam-frame p-5 rounded-2xl transition-all shadow-md ${
                  isUser
                    ? 'border-[#6C5636]/70 bg-[#1C1813]/90 text-[#F5F2EB]'
                    : isBreach
                    ? 'border-[#C23B22]/60 bg-[#2A0E0B]/90 text-[#FFDED9]'
                    : anyBlocked
                    ? 'border-[#D4AF37]/50 bg-[#231B0E]/90 text-[#FDF1D6]'
                    : 'border-[#899D73]/40 bg-[#10140F]/90 text-[#F5F2EB]'
                }`}
              >
                <div
                  className={`flex items-center justify-between gap-4 text-xs font-mono mb-2.5 ${
                    isUser ? 'text-[#D6CFC4]/80' : 'text-[#899D73]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold flex items-center gap-1.5 text-[#F5F2EB]">
                      {isUser ? (
                        <>
                          <Swords className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span>Challenger</span>
                        </>
                      ) : (
                        <>
                          <Shield className="w-3.5 h-3.5 text-[#899D73]" />
                          <span>Aria</span>
                        </>
                      )}
                    </span>
                    <span className="text-[#D6CFC4]/50">&bull;</span>
                    <span className="text-[#D6CFC4]/60">Turn #{m.message_index + 1}</span>
                    {m.attack_class && (
                      <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-[#090907] border border-[#6C5636]/40 text-[#D6CFC4]">
                        {m.attack_class}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {isBreach && (
                      <span className="text-[#C23B22] font-black uppercase text-[10px] tracking-wider">
                        [CANARY LEAKED]
                      </span>
                    )}
                    {anyBlocked && (
                      <span className="text-[#D4AF37] font-black uppercase text-[10px] tracking-wider">
                        [FIREWALL INTERCEPT]
                      </span>
                    )}
                    <span className="text-[10px] text-[#D6CFC4]/50">
                      {new Date(m.created_at).toLocaleTimeString()}
                    </span>
                  </div>
                </div>

                <div className="text-sm font-sans whitespace-pre-wrap break-words leading-relaxed text-[#F5F2EB]">
                  {m.content}
                </div>

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

import Link from 'next/link';
import { db, initDb } from '@/lib/db';
import {
  Trophy,
  Shield,
  Medal,
  Swords,
  History,
  ArrowRight,
  ShieldCheck,
  AlertOctagon,
  Sparkles,
  Flame,
} from 'lucide-react';

export const dynamic = 'force-dynamic';

interface LeaderboardEntry {
  handle: string;
  identityId: string;
  minTurns: number;
  variant: string;
  sessionId: string;
  breachDate: string;
}

interface RecentSession {
  sessionId: string;
  variant: string;
  messageCount: number;
  breached: boolean;
  createdAt: string;
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await initDb();
  const res = await db.execute({
    sql: `SELECT s.identity_id, s.id as session_id, s.variant, s.message_count, s.resolved_at, s.created_at
          FROM sessions s
          WHERE s.breached = 1
          ORDER BY s.message_count ASC, s.created_at ASC
          LIMIT 50`,
    args: [],
  });

  const seen = new Set<string>();
  const entries: LeaderboardEntry[] = [];

  for (const row of res.rows) {
    const identityId = String(row.identity_id);
    if (seen.has(identityId)) continue;
    seen.add(identityId);

    const handle = `Anon-${identityId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8)}`;
    entries.push({
      handle,
      identityId,
      minTurns: Math.max(1, Math.floor(Number(row.message_count) / 2)),
      variant: String(row.variant),
      sessionId: String(row.session_id),
      breachDate: String(row.resolved_at || row.created_at),
    });
  }

  return entries.slice(0, 25);
}

async function getRecentSessions(): Promise<RecentSession[]> {
  await initDb();
  const res = await db.execute({
    sql: `SELECT id as session_id, variant, message_count, breached, created_at
          FROM sessions
          ORDER BY created_at DESC
          LIMIT 20`,
    args: [],
  });
  return res.rows.map((row) => ({
    sessionId: String(row.session_id),
    variant: String(row.variant),
    messageCount: Number(row.message_count),
    breached: Boolean(row.breached),
    createdAt: String(row.created_at),
  }));
}

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();
  const recentSessions = await getRecentSessions();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title Bar */}
      <div className="border-b border-[#6C5636]/40 pb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#F5F2EB] flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#6C5636]/25 border border-[#899D73]/40 flex items-center justify-center text-[#899D73]">
              <Trophy className="w-5 h-5" />
            </span>
            <span>Hall of Breaches</span>
          </h1>
          <p className="text-sm text-[#D6CFC4]/70 mt-1 font-medium font-sans">
            Top anonymous security challengers ranked by fewest turns to extract Aria&apos;s secret canary token.
          </p>
        </div>

        <Link
          href="/arena"
          className="px-5 py-2.5 rounded-xl bg-[#6C5636] hover:bg-[#899D73] text-[#F5F2EB] text-xs font-mono font-bold transition-all shadow-md flex items-center gap-2"
        >
          <Swords className="w-3.5 h-3.5" />
          <span>Enter Arena</span>
        </Link>
      </div>

      {/* Main Leaderboard Rankings */}
      <div className="sudarkalam-frame rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-[#13120E]/90 border-b border-[#6C5636]/30 flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#899D73]">
            Verified Breachers
          </span>
          <span className="text-xs font-mono text-[#D6CFC4]/60">Cryptographic Identifiers</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-14 text-center text-[#D6CFC4]/60 font-mono text-sm space-y-3.5">
            <div className="w-16 h-16 rounded-2xl bg-[#6C5636]/15 border border-[#6C5636]/40 mx-auto flex items-center justify-center text-[#899D73]">
              <Shield className="w-8 h-8" />
            </div>
            <div className="text-[#F5F2EB] font-serif font-bold text-lg">No Breaches Recorded Yet</div>
            <p className="text-xs text-[#D6CFC4]/70 max-w-sm mx-auto font-sans leading-relaxed">
              Aria&apos;s vaults currently stand uncompromised. Be the first to execute a verified jailbreak and claim the #1 rank!
            </p>
            <div className="pt-2">
              <Link
                href="/arena"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#C23B22] hover:bg-[#A82810] text-[#F5F2EB] text-xs font-bold transition-all shadow-lg shadow-[#C23B22]/20 font-mono"
              >
                <span>Launch an Attack</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-[#13120E] text-[#899D73] text-xs font-mono uppercase tracking-wider border-b border-[#6C5636]/30 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Challenger Handle</th>
                  <th className="py-3.5 px-4 text-center">Turns to Breach</th>
                  <th className="py-3.5 px-4 text-center">Target Variant</th>
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-right">Replay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#6C5636]/20 font-mono text-xs">
                {entries.map((entry, index) => {
                  return (
                    <tr key={entry.identityId} className="hover:bg-[#6C5636]/15 transition-colors">
                      <td className="py-4 px-4 font-bold text-[#F5F2EB]">
                        {index === 0 ? (
                          <span className="inline-flex items-center gap-1 text-[#D4AF37] font-black">
                            <Medal className="w-4 h-4" /> #1
                          </span>
                        ) : index === 1 ? (
                          <span className="inline-flex items-center gap-1 text-[#D6CFC4] font-black">
                            <Medal className="w-4 h-4" /> #2
                          </span>
                        ) : index === 2 ? (
                          <span className="inline-flex items-center gap-1 text-[#6C5636] font-black">
                            <Medal className="w-4 h-4" /> #3
                          </span>
                        ) : (
                          <span className="text-[#D6CFC4]/50">#{index + 1}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-bold text-[#F5F2EB] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[#899D73]/20 border border-[#899D73]/40 flex items-center justify-center text-[10px] text-[#899D73] font-black">
                          <Swords className="w-3.5 h-3.5" />
                        </span>
                        <span>{entry.handle}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-[#C23B22] font-black">
                        {entry.minTurns} {entry.minTurns === 1 ? 'turn' : 'turns'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-md uppercase text-[10px] font-black ${
                            entry.variant === 'control'
                              ? 'bg-[#6C5636]/25 text-[#D6CFC4] border border-[#6C5636]/40'
                              : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
                          }`}
                        >
                          {entry.variant}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-[#D6CFC4]/70 font-medium">
                        {new Date(entry.breachDate).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/replay/${entry.sessionId}`}
                          className="text-[#899D73] font-bold hover:text-[#F5F2EB] hover:underline text-xs inline-flex items-center gap-1"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Universal Recent Sessions Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-serif font-black text-[#F5F2EB] flex items-center gap-2">
            <History className="w-5 h-5 text-[#899D73]" />
            <span>Recent Sessions</span>
          </h2>
          <span className="text-xs font-mono text-[#D6CFC4]/60">Universal telemetry replay feed</span>
        </div>

        <div className="sudarkalam-frame rounded-2xl overflow-hidden shadow-2xl">
          {recentSessions.length === 0 ? (
            <div className="p-8 text-center text-xs font-mono text-[#D6CFC4]/50">No sessions recorded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#13120E] text-[#899D73] uppercase tracking-wider border-b border-[#6C5636]/30 font-bold">
                  <tr>
                    <th className="py-3.5 px-4">Session ID</th>
                    <th className="py-3.5 px-4 text-center">Variant</th>
                    <th className="py-3.5 px-4 text-center">Turns</th>
                    <th className="py-3.5 px-4 text-center">Defense Status</th>
                    <th className="py-3.5 px-4 text-right">Timestamp</th>
                    <th className="py-3.5 px-4 text-right">Replay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#6C5636]/20">
                  {recentSessions.map((s) => (
                    <tr key={s.sessionId} className="hover:bg-[#6C5636]/15 transition-colors">
                      <td className="py-3 px-4 text-[#D6CFC4]/80">{s.sessionId.slice(0, 12)}&hellip;</td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2.5 py-0.5 rounded-md uppercase text-[10px] font-black ${
                            s.variant === 'control'
                              ? 'bg-[#6C5636]/25 text-[#D6CFC4] border border-[#6C5636]/40'
                              : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
                          }`}
                        >
                          {s.variant}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center text-[#F5F2EB] font-semibold">
                        {Math.floor(s.messageCount / 2)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        {s.breached ? (
                          <span className="text-[#C23B22] font-black uppercase inline-flex items-center gap-1">
                            <AlertOctagon className="w-3 h-3" />
                            <span>Breached</span>
                          </span>
                        ) : (
                          <span className="text-[#899D73] font-medium inline-flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            <span>Defended</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right text-[#D6CFC4]/60">
                        {new Date(s.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/replay/${s.sessionId}`}
                          className="text-[#899D73] hover:text-[#F5F2EB] font-bold hover:underline inline-flex items-center gap-1"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

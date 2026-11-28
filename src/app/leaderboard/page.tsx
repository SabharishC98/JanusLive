import Link from 'next/link';
import crypto from 'crypto';
import { db, initDb } from '@/lib/db';
import { SudarIcon } from '@/components/SudarIcon';

export const dynamic = 'force-dynamic';

interface LeaderboardEntry {
  handle: string;
  identityId: string;
  turns: number;
  variant: string;
  sessionId: string;
  breachDate: string;
  isClaimed: boolean;
}

interface RecentSession {
  sessionId: string;
  variant: string;
  messageCount: number;
  breached: boolean;
  createdAt: string;
}

function getTournamentStatus() {
  const stopDateStr = process.env.TOURNAMENT_ENDS_AT || '2026-12-05T00:00:00Z';
  const stopDate = new Date(stopDateStr);
  const isTournamentOver = Date.now() >= stopDate.getTime();
  return { isTournamentOver, stopDateStr };
}

async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  await initDb();
  const res = await db.execute({
    sql: `SELECT s.identity_id, s.id as session_id, s.variant, s.message_count, s.breach_turn, s.resolved_at, s.created_at,
                 c.handle as claimed_handle
          FROM sessions s
          LEFT JOIN claims c ON s.identity_id = c.identity_id
          WHERE s.breached = 1
          ORDER BY (CASE WHEN s.breach_turn IS NOT NULL THEN s.breach_turn ELSE s.message_count END) ASC, s.created_at ASC
          LIMIT 50`,
    args: [],
  });

  const seen = new Set<string>();
  const entries: LeaderboardEntry[] = [];

  for (const row of res.rows) {
    const identityId = String(row.identity_id);
    if (seen.has(identityId)) continue;
    seen.add(identityId);

    const isClaimed = Boolean(row.claimed_handle);
    const token = crypto.createHash('md5').update(identityId).digest('hex').slice(0, 6);
    const handle = row.claimed_handle ? String(row.claimed_handle) : `Anon-${token}`;

    const turns =
      row.breach_turn != null
        ? Number(row.breach_turn) + 1
        : Math.max(1, Math.floor(Number(row.message_count) / 2)) + 1;

    entries.push({
      handle,
      identityId,
      turns,
      variant: String(row.variant),
      sessionId: String(row.session_id),
      breachDate: String(row.resolved_at || row.created_at),
      isClaimed,
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
  const { isTournamentOver, stopDateStr } = getTournamentStatus();
  const entries = await getLeaderboard();
  const recentSessions = isTournamentOver ? await getRecentSessions() : [];

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Title Bar */}
      <div className="border-b border-[#6C5636]/40 pb-6 flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-serif font-black text-[#FFFFFF] flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#6C5636]/25 border border-[#6C5636]/60 flex items-center justify-center p-1.5 shadow-md">
              <SudarIcon name="trophy" size={24} />
            </span>
            <span>Hall of Breaches</span>
          </h1>
          <p className="text-sm text-[#D6CFC4]/80 mt-1 font-medium font-sans">
            Top security challengers ranked by fewest turns to extract Aria&apos;s canary token. Ranked by breach turn ASC, then time.
          </p>
        </div>

        <Link
          href="/arena"
          className="px-5 py-2.5 rounded-xl bg-[#6C5636] hover:bg-[#856B44] text-[#FFFFFF] text-xs font-mono font-bold transition-all shadow-md flex items-center gap-2 border border-[#6C5636]"
        >
          <SudarIcon name="talwars" size={14} />
          <span>Enter Arena</span>
        </Link>
      </div>

      {/* Main Leaderboard Rankings */}
      <div className="sudarkalam-frame rounded-2xl overflow-hidden shadow-2xl">
        <div className="p-4 bg-[#13120E]/90 border-b border-[#6C5636]/40 flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-[#FFFFFF] flex items-center gap-2">
            <SudarIcon name="trophy" size={14} />
            <span>Verified Breachers</span>
          </span>
          <span className="text-xs font-mono text-[#D6CFC4]/70">Ranked by Turns to Breach</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-14 text-center text-[#D6CFC4]/70 font-mono text-sm space-y-3.5">
            <div className="w-16 h-16 rounded-2xl bg-[#6C5636]/20 border border-[#6C5636]/50 mx-auto flex items-center justify-center p-3">
              <SudarIcon name="shield" size={38} />
            </div>
            <div className="text-[#FFFFFF] font-serif font-bold text-lg">No Breaches Recorded Yet</div>
            <p className="text-xs text-[#D6CFC4]/80 max-w-sm mx-auto font-sans leading-relaxed">
              Aria&apos;s vaults currently stand uncompromised. Be the first to execute a verified jailbreak and claim the #1 rank!
            </p>
            <div className="pt-2">
              <Link
                href="/arena"
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[#6C5636] hover:bg-[#856B44] text-[#FFFFFF] text-xs font-bold transition-all shadow-lg font-mono border border-[#6C5636]"
              >
                <span>Launch an Attack</span>
                <SudarIcon name="talwars" size={14} />
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-[#13120E] text-[#FFFFFF] text-xs font-mono uppercase tracking-wider border-b border-[#6C5636]/40 font-bold">
                <tr>
                  <th className="py-3.5 px-4">Rank</th>
                  <th className="py-3.5 px-4">Challenger Handle</th>
                  <th className="py-3.5 px-4 text-center">Turns to Breach</th>
                  {isTournamentOver && <th className="py-3.5 px-4 text-center">Target Variant</th>}
                  <th className="py-3.5 px-4 text-right">Date</th>
                  <th className="py-3.5 px-4 text-right">Replay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#6C5636]/30 font-mono text-xs">
                {entries.map((entry, index) => {
                  return (
                    <tr key={entry.identityId} className="hover:bg-[#6C5636]/20 transition-colors">
                      <td className="py-4 px-4 font-bold text-[#FFFFFF]">
                        {index === 0 ? (
                          <span className="inline-flex items-center gap-1.5 text-[#FFFFFF] font-black">
                            <SudarIcon name="trophy" size={14} /> #1
                          </span>
                        ) : index === 1 ? (
                          <span className="inline-flex items-center gap-1.5 text-[#D6CFC4] font-black">
                            <SudarIcon name="trophy" size={14} /> #2
                          </span>
                        ) : index === 2 ? (
                          <span className="inline-flex items-center gap-1.5 text-[#6C5636] font-black">
                            <SudarIcon name="trophy" size={14} /> #3
                          </span>
                        ) : (
                          <span className="text-[#D6CFC4]/60">#{index + 1}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-bold text-[#FFFFFF]">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-[#6C5636]/30 border border-[#6C5636]/60 flex items-center justify-center p-1">
                            <SudarIcon name="talwars" size={12} />
                          </span>
                          <span>{entry.handle}</span>
                          {entry.isClaimed && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#6C5636]/30 text-[#D6CFC4] border border-[#6C5636]/60 font-semibold">
                              CLAIMED
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-4 px-4 text-center text-[#C23B22] font-black">
                        {entry.turns} {entry.turns === 1 ? 'turn' : 'turns'}
                      </td>
                      {isTournamentOver && (
                        <td className="py-4 px-4 text-center">
                          <span
                            className={`px-3 py-1 rounded-md uppercase text-[10px] font-black ${
                              entry.variant === 'control'
                                ? 'bg-[#6C5636]/30 text-[#FFFFFF] border border-[#6C5636]/60'
                                : 'bg-[#6C5636]/50 text-[#FFFFFF] border border-[#6C5636]'
                            }`}
                          >
                            {entry.variant}
                          </span>
                        </td>
                      )}
                      <td className="py-4 px-4 text-right text-[#D6CFC4]/70 font-medium">
                        {new Date(entry.breachDate).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/replay/${entry.sessionId}`}
                          className="text-[#FFFFFF] font-bold hover:underline text-xs inline-flex items-center gap-1.5"
                        >
                          <span>Inspect</span>
                          <SudarIcon name="manuscript" size={12} />
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

      {/* Tournament Active Notice or Recent Sessions Table */}
      {!isTournamentOver ? (
        <div className="sudarkalam-frame p-5 rounded-2xl bg-[#090907]/90 text-xs font-mono text-[#D6CFC4]/80 flex items-center justify-between border border-[#6C5636]/40">
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-[#6C5636]/20 border border-[#6C5636]/50 text-[#FFFFFF]">
              <SudarIcon name="shield" size={18} />
            </span>
            <div>
              <div className="text-[#FFFFFF] font-bold">Tournament Arm Blinding Active</div>
              <p className="text-[11px] text-[#D6CFC4]/70 font-sans mt-0.5">
                Target variants and recent sessions feed are blinded to safeguard ongoing scientific evaluation until tournament close ({new Date(stopDateStr).toLocaleDateString()}).
              </p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-serif font-black text-[#FFFFFF] flex items-center gap-2.5">
              <SudarIcon name="manuscript" size={20} />
              <span>Recent Sessions</span>
            </h2>
            <span className="text-xs font-mono text-[#D6CFC4]/70">Universal telemetry replay feed</span>
          </div>

          <div className="sudarkalam-frame rounded-2xl overflow-hidden shadow-2xl">
            {recentSessions.length === 0 ? (
              <div className="p-8 text-center text-xs font-mono text-[#D6CFC4]/60">No sessions recorded yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead className="bg-[#13120E] text-[#FFFFFF] uppercase tracking-wider border-b border-[#6C5636]/40 font-bold">
                    <tr>
                      <th className="py-3.5 px-4">Session ID</th>
                      <th className="py-3.5 px-4 text-center">Variant</th>
                      <th className="py-3.5 px-4 text-center">Turns</th>
                      <th className="py-3.5 px-4 text-center">Defense Status</th>
                      <th className="py-3.5 px-4 text-right">Timestamp</th>
                      <th className="py-3.5 px-4 text-right">Replay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#6C5636]/30">
                    {recentSessions.map((s) => (
                      <tr key={s.sessionId} className="hover:bg-[#6C5636]/20 transition-colors">
                        <td className="py-3 px-4 text-[#D6CFC4]/90">{s.sessionId.slice(0, 12)}&hellip;</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2.5 py-0.5 rounded-md uppercase text-[10px] font-black ${
                              s.variant === 'control'
                                ? 'bg-[#6C5636]/30 text-[#FFFFFF] border border-[#6C5636]/60'
                                : 'bg-[#6C5636]/50 text-[#FFFFFF] border border-[#6C5636]'
                            }`}
                          >
                            {s.variant}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center text-[#FFFFFF] font-semibold">
                          {Math.floor(s.messageCount / 2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          {s.breached ? (
                            <span className="text-[#C23B22] font-black uppercase inline-flex items-center gap-1">
                              <SudarIcon name="talwars" size={10} />
                              <span>Breached</span>
                            </span>
                          ) : (
                            <span className="text-[#FFFFFF] font-medium inline-flex items-center gap-1">
                              <SudarIcon name="shield" size={10} />
                              <span>Defended</span>
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-[#D6CFC4]/70">
                          {new Date(s.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <Link
                            href={`/replay/${s.sessionId}`}
                            className="text-[#FFFFFF] hover:underline font-bold inline-flex items-center gap-1.5"
                          >
                            <span>Inspect</span>
                            <SudarIcon name="manuscript" size={12} />
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
      )}
    </div>
  );
}

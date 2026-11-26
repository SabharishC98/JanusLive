import Link from 'next/link';
import { db, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

interface LeaderboardEntry {
  handle: string;
  identityId: string;
  minTurns: number;
  variant: string;
  sessionId: string;
  breachDate: string;
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

    // Anonymous handle based on identity UUID slice
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

export default async function LeaderboardPage() {
  const entries = await getLeaderboard();

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="border-b border-[#E7D5C0] pb-6">
        <h1 className="text-3xl font-black text-[#1C1917] flex items-center gap-3">
          <span>🏆</span> Hall of Breaches
        </h1>
        <p className="text-sm text-[#78716C] mt-1 font-medium">
          Top anonymous red-teamers ranked by fewest conversational turns required to leak Aria&apos;s secret vault code.
        </p>
      </div>

      <div className="rounded-2xl border border-[#E7D5C0] bg-[#FFF7EE] overflow-hidden shadow-sm">
        <div className="p-4 bg-[#F9EAD7]/50 border-b border-[#E7D5C0] flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase text-[#1C1917]">Rankings</span>
          <span className="text-xs font-mono text-[#78716C] font-semibold">Anonymous Identifiers</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-12 text-center text-[#78716C] font-mono text-sm space-y-3">
            <div className="text-4xl">🛡️</div>
            <div className="text-[#1C1917] font-black text-base">No Breaches Yet</div>
            <p className="text-xs text-[#78716C] max-w-sm mx-auto">
              Be the first to jailbreak Aria and capture the #1 position on the leaderboard!
            </p>
            <div className="pt-2">
              <Link href="/arena" className="px-5 py-2.5 rounded-full bg-[#E10600] hover:bg-[#B80500] text-white text-xs font-bold shadow-md">
                Launch an Attack &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-[#F9EAD7]/70 text-[#1C1917] text-xs font-mono uppercase tracking-wider border-b border-[#E7D5C0] font-black">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Attacker Handle</th>
                  <th className="py-3 px-4 text-center">Turns to Breach</th>
                  <th className="py-3 px-4 text-center">Target Variant</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-4 text-right">Replay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E7D5C0] font-mono text-xs">
                {entries.map((entry, index) => {
                  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;

                  return (
                    <tr key={entry.identityId} className="hover:bg-[#F9EAD7]/30 transition-colors">
                      <td className="py-4 px-4 font-bold text-[#1C1917]">
                        {medal ? (
                          <span className="text-lg mr-1">{medal}</span>
                        ) : (
                          <span className="text-[#78716C]">#{index + 1}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-bold text-[#1C1917] flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[#BFE23A] border border-[#1C1917]/20 flex items-center justify-center text-[10px] text-[#1C1917] font-black">
                          ⚡
                        </span>
                        <span>{entry.handle}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-[#E10600] font-black">
                        {entry.minTurns} {entry.minTurns === 1 ? 'turn' : 'turns'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-3 py-1 rounded-full uppercase text-[10px] font-black ${
                            entry.variant === 'control'
                              ? 'bg-[#E7D5C0] text-[#1C1917]'
                              : 'bg-[#BFE23A] text-[#1C1917] border border-[#1C1917]/20'
                          }`}
                        >
                          {entry.variant}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-[#78716C] font-semibold">
                        {new Date(entry.breachDate).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/replay/${entry.sessionId}`}
                          className="text-[#E10600] font-bold hover:underline text-xs"
                        >
                          Inspect &rarr;
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
    </div>
  );
}

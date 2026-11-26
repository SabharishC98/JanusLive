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
      <div className="border-b border-zinc-800 pb-6">
        <h1 className="text-3xl font-extrabold text-white flex items-center gap-3">
          <span>🏆</span> Hall of Breaches
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Top anonymous red-teamers ranked by fewest conversational turns required to leak Aria&apos;s secret vault code.
        </p>
      </div>

      <div className="rounded-2xl border border-zinc-800 bg-zinc-950/80 overflow-hidden shadow-xl">
        <div className="p-4 bg-zinc-900/40 border-b border-zinc-800 flex items-center justify-between">
          <span className="text-xs font-mono font-bold uppercase text-zinc-400">Rankings</span>
          <span className="text-xs font-mono text-zinc-500">Anonymous Identifiers</span>
        </div>

        {entries.length === 0 ? (
          <div className="p-12 text-center text-zinc-500 font-mono text-sm space-y-2">
            <div className="text-3xl">🛡️</div>
            <div className="text-zinc-300 font-bold">No Breaches Yet</div>
            <p className="text-xs text-zinc-500">
              Be the first to jailbreak Aria and capture the #1 position on the leaderboard!
            </p>
            <div className="pt-2">
              <Link href="/arena" className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold">
                Launch an Attack &rarr;
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm font-sans">
              <thead className="bg-zinc-900/60 text-zinc-400 text-xs font-mono uppercase tracking-wider border-b border-zinc-800">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Attacker Handle</th>
                  <th className="py-3 px-4 text-center">Turns to Breach</th>
                  <th className="py-3 px-4 text-center">Target Variant</th>
                  <th className="py-3 px-4 text-right">Date</th>
                  <th className="py-3 px-4 text-right">Replay</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 font-mono text-xs">
                {entries.map((entry, index) => {
                  const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;

                  return (
                    <tr key={entry.identityId} className="hover:bg-zinc-900/40 transition-colors">
                      <td className="py-4 px-4 font-bold text-zinc-300">
                        {medal ? (
                          <span className="text-lg mr-1">{medal}</span>
                        ) : (
                          <span className="text-zinc-500">#{index + 1}</span>
                        )}
                      </td>
                      <td className="py-4 px-4 font-bold text-white flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-zinc-800 flex items-center justify-center text-[10px]">
                          ⚡
                        </span>
                        <span>{entry.handle}</span>
                      </td>
                      <td className="py-4 px-4 text-center text-rose-400 font-bold">
                        {entry.minTurns} {entry.minTurns === 1 ? 'turn' : 'turns'}
                      </td>
                      <td className="py-4 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded uppercase text-[10px] font-bold ${
                            entry.variant === 'control'
                              ? 'bg-zinc-800 text-zinc-300'
                              : entry.variant === 'hardened'
                              ? 'bg-blue-950 text-blue-300 border border-blue-800/40'
                              : 'bg-indigo-950 text-indigo-300 border border-indigo-800/40'
                          }`}
                        >
                          {entry.variant}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-right text-zinc-500">
                        {new Date(entry.breachDate).toLocaleDateString()}
                      </td>
                      <td className="py-4 px-4 text-right">
                        <Link
                          href={`/replay/${entry.sessionId}`}
                          className="text-indigo-400 hover:text-indigo-300 underline text-xs"
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

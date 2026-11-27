import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { isSimulatedDb } from '@/lib/db';

export const metadata: Metadata = {
  title: 'PwnLab Live — LLM Jailbreak Tournament',
  description: '2-arm live A/B test on prompt-injection defenses',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isSimulated = isSimulatedDb();
  const preregCommit = process.env.PREREG_COMMIT || process.env.HYPOTHESIS_COMMIT_HASH || '';
  const shortHash = preregCommit ? preregCommit.slice(0, 7) : 'latest';

  return (
    <html lang="en">
      <body className="bg-[#F9EAD7] text-[#1C1917] min-h-screen flex flex-col font-sans selection:bg-[#BFE23A] selection:text-[#1C1917]">
        {/* Fixed red banner when running against dev / sim database */}
        {isSimulated && (
          <div className="bg-[#E10600] text-white text-xs font-mono font-extrabold tracking-widest text-center py-2 px-4 sticky top-0 z-[100] shadow-md border-b border-[#B80500] flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span>SIMULATED DATA ACTIVE — CONNECTED TO DEVELOPMENT DATABASE</span>
            <span>⚠️</span>
          </div>
        )}

        <header className="border-b border-[#E7D5C0] bg-[#F9EAD7]/90 backdrop-blur sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl">⚡</span>
              <span className="font-extrabold text-lg tracking-tight text-[#1C1917] group-hover:text-[#E10600] transition-colors">
                PwnLab <span className="text-[#E10600] font-mono font-black">Live</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-3 text-sm font-semibold">
              <Link href="/arena" className="px-3.5 py-1.5 rounded-full text-[#1C1917] hover:bg-[#BFE23A] transition-all">
                Arena
              </Link>
              <Link href="/results" className="px-3.5 py-1.5 rounded-full text-[#1C1917] hover:bg-[#BFE23A] transition-all">
                Results
              </Link>
              <Link href="/leaderboard" className="px-3.5 py-1.5 rounded-full text-[#1C1917] hover:bg-[#BFE23A] transition-all">
                Leaderboard
              </Link>
              <Link href="/ship" className="px-3.5 py-1.5 rounded-full text-[#1C1917] hover:bg-[#BFE23A] transition-all">
                Ship Gate
              </Link>
              <Link href="/method" className="px-3.5 py-1.5 rounded-full text-[#1C1917] hover:bg-[#BFE23A] transition-all">
                Method
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-[#E7D5C0] py-6 text-center text-xs text-[#78716C]">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>PwnLab Live &copy; 2026 — Flagsmith Experimentation + Gemini Server-side</div>
            <div className="font-mono text-[#78716C]">{`pre-registered, see commit ${shortHash}`}</div>
          </div>
        </footer>
      </body>
    </html>
  );
}

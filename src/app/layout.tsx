import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { isSimulatedDb } from '@/lib/db';
import { SudarKalamBackground } from '@/components/SudarKalamBackground';
import { Swords, ShieldAlert, GitCommit, Compass } from 'lucide-react';

export const metadata: Metadata = {
  title: 'SudarKalam — LLM Jailbreak Defense Arena',
  description: '2-arm live A/B test on prompt-injection defenses',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isSimulated = isSimulatedDb();
  const preregCommit = process.env.PREREG_COMMIT || process.env.HYPOTHESIS_COMMIT_HASH || '';
  const shortHash = preregCommit ? preregCommit.slice(0, 7) : 'latest';

  return (
    <html lang="en" className="dark">
      <body className="bg-[#090907] text-[#F5F2EB] min-h-screen flex flex-col font-sans selection:bg-[#899D73] selection:text-[#090907] relative overflow-x-hidden">
        {/* Dynamic revolving dragon + central arena background */}
        <SudarKalamBackground />

        {/* Fixed banner when running against dev / sim database */}
        {isSimulated && (
          <aside aria-label="Development Notice" className="bg-[#C23B22] text-[#F5F2EB] text-xs font-mono font-bold tracking-widest text-center py-2 px-4 sticky top-0 z-[100] shadow-lg border-b border-[#8E2815] flex items-center justify-center gap-2">
            <ShieldAlert className="w-4 h-4 text-[#F5F2EB]" />
            <span>SIMULATED DATA ACTIVE — CONNECTED TO DEVELOPMENT DATABASE</span>
            <ShieldAlert className="w-4 h-4 text-[#F5F2EB]" />
          </aside>
        )}

        <header className="border-b border-[#6C5636]/30 bg-[#090907]/80 backdrop-blur-md sticky top-0 z-40 transition-colors">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-9 h-9 rounded-lg bg-[#6C5636]/20 border border-[#6C5636]/50 flex items-center justify-center text-[#899D73] group-hover:border-[#899D73] group-hover:text-[#F5F2EB] transition-all">
                <Swords className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-wide text-[#F5F2EB] group-hover:text-[#899D73] transition-colors leading-tight font-serif">
                  Sudar<span className="text-[#899D73]">Kalam</span>
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#899D73]/80 font-bold">
                  Live Defense Arena
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1 sm:gap-2 text-xs font-mono uppercase tracking-wider font-bold">
              <Link
                href="/arena"
                className="px-3.5 py-1.5 rounded-lg text-[#D6CFC4] hover:text-[#F5F2EB] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/50 transition-all"
              >
                Arena
              </Link>
              <Link
                href="/results"
                className="px-3.5 py-1.5 rounded-lg text-[#D6CFC4] hover:text-[#F5F2EB] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/50 transition-all"
              >
                Results
              </Link>
              <Link
                href="/leaderboard"
                className="px-3.5 py-1.5 rounded-lg text-[#D6CFC4] hover:text-[#F5F2EB] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/50 transition-all"
              >
                Leaderboard
              </Link>
              <Link
                href="/ship"
                className="px-3.5 py-1.5 rounded-lg text-[#D6CFC4] hover:text-[#F5F2EB] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/50 transition-all"
              >
                Ship Gate
              </Link>
              <Link
                href="/method"
                className="px-3.5 py-1.5 rounded-lg text-[#D6CFC4] hover:text-[#F5F2EB] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/50 transition-all"
              >
                Method
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 relative z-10">
          {children}
        </main>

        <footer className="border-t border-[#6C5636]/30 bg-[#090907]/90 backdrop-blur-sm py-6 text-center text-xs text-[#899D73]/80 relative z-10 font-mono">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#D6CFC4]/70">
              <Compass className="w-3.5 h-3.5 text-[#899D73]" />
              <span>SudarKalam &copy; 2026 — Flagsmith Experimentation + Live Firewalls</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#899D73] bg-[#6C5636]/20 px-3 py-1 rounded-full border border-[#6C5636]/40">
              <GitCommit className="w-3.5 h-3.5 text-[#899D73]" />
              <span>{`pre-registered, see commit ${shortHash}`}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

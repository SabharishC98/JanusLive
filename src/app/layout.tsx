import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { isSimulatedDb } from '@/lib/db';
import { SudarKalamBackground } from '@/components/SudarKalamBackground';
import { SudarIcon } from '@/components/SudarIcon';

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
      <body className="bg-[#090907] text-[#FFFFFF] min-h-screen flex flex-col font-sans selection:bg-[#6C5636] selection:text-[#FFFFFF] relative overflow-x-hidden">
        {/* Dynamic revolving dragon + central arena background */}
        <SudarKalamBackground />

        {/* Fixed banner when running against dev / sim database */}
        {isSimulated && (
          <aside
            aria-label="Development Notice"
            className="bg-[#C23B22] text-[#FFFFFF] text-xs font-mono font-bold tracking-widest text-center py-2 px-4 sticky top-0 z-[100] shadow-lg border-b border-[#8E2815] flex items-center justify-center gap-2"
          >
            <SudarIcon name="shield" size={16} />
            <span>SIMULATED DATA ACTIVE &mdash; CONNECTED TO DEVELOPMENT DATABASE</span>
            <SudarIcon name="shield" size={16} />
          </aside>
        )}

        <header className="border-b border-[#6C5636]/40 bg-[#090907]/75 backdrop-blur-md sticky top-0 z-40 transition-colors">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3 group">
              <div className="w-10 h-10 rounded-xl bg-[#6C5636]/20 border border-[#6C5636]/60 flex items-center justify-center group-hover:border-[#FFFFFF] transition-all p-1.5">
                <SudarIcon name="dragon" size={26} />
              </div>
              <div className="flex flex-col">
                <span className="font-extrabold text-lg tracking-wide text-[#FFFFFF] group-hover:text-[#F5F2EB] transition-colors leading-tight font-serif">
                  Sudar<span className="text-[#6C5636]">Kalam</span>
                </span>
                <span className="text-[10px] font-mono tracking-widest uppercase text-[#D6CFC4]/70 font-bold">
                  Live Defense Arena
                </span>
              </div>
            </Link>

            <nav className="flex items-center gap-1 sm:gap-2 text-xs font-mono uppercase tracking-wider font-bold">
              <Link
                href="/arena"
                className="px-3.5 py-1.5 rounded-lg text-[#F5F2EB] hover:text-[#FFFFFF] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/60 transition-all flex items-center gap-1.5"
              >
                <SudarIcon name="talwars" size={14} />
                <span>Arena</span>
              </Link>
              <Link
                href="/results"
                className="px-3.5 py-1.5 rounded-lg text-[#F5F2EB] hover:text-[#FFFFFF] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/60 transition-all flex items-center gap-1.5"
              >
                <SudarIcon name="shield" size={14} />
                <span>Results</span>
              </Link>
              <Link
                href="/leaderboard"
                className="px-3.5 py-1.5 rounded-lg text-[#F5F2EB] hover:text-[#FFFFFF] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/60 transition-all flex items-center gap-1.5"
              >
                <SudarIcon name="trophy" size={14} />
                <span>Leaderboard</span>
              </Link>
              <Link
                href="/ship"
                className="px-3.5 py-1.5 rounded-lg text-[#F5F2EB] hover:text-[#FFFFFF] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/60 transition-all flex items-center gap-1.5"
              >
                <SudarIcon name="vault" size={14} />
                <span>Ship Gate</span>
              </Link>
              <Link
                href="/method"
                className="px-3.5 py-1.5 rounded-lg text-[#F5F2EB] hover:text-[#FFFFFF] hover:bg-[#6C5636]/30 border border-transparent hover:border-[#6C5636]/60 transition-all flex items-center gap-1.5"
              >
                <SudarIcon name="manuscript" size={14} />
                <span>Method</span>
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 relative z-10">
          {children}
        </main>

        <footer className="border-t border-[#6C5636]/30 bg-[#090907]/80 backdrop-blur-sm py-6 text-center text-xs text-[#D6CFC4]/70 relative z-10 font-mono">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#FFFFFF]/80">
              <SudarIcon name="dragon" size={14} />
              <span>SudarKalam &copy; 2026 &mdash; Flagsmith Experimentation + Live Firewalls</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#FFFFFF] bg-[#6C5636]/30 px-3 py-1 rounded-full border border-[#6C5636]/60">
              <SudarIcon name="manuscript" size={12} />
              <span>{`pre-registered, see commit ${shortHash}`}</span>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

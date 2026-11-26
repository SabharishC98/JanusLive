import type { Metadata } from 'next';
import './globals.css';
import Link from 'next/link';
import { isSimulatedDb } from '@/lib/db';

export const metadata: Metadata = {
  title: 'PwnLab Live — LLM Jailbreak Tournament',
  description: 'Public LLM-jailbreak tournament running real Flagsmith Experimentation A/B/C tests on prompt-injection defenses.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const isSimulated = isSimulatedDb();

  return (
    <html lang="en" className="dark">
      <body className="bg-slate-950 text-zinc-100 min-h-screen flex flex-col font-sans">
        {/* Fixed red banner when running against dev / sim database */}
        {isSimulated && (
          <div className="bg-rose-600 text-white text-xs font-mono font-extrabold tracking-widest text-center py-2 px-4 sticky top-0 z-[100] shadow-xl border-b border-rose-700 flex items-center justify-center gap-2">
            <span>⚠️</span>
            <span>SIMULATED DATA ACTIVE — CONNECTED TO DEVELOPMENT DATABASE</span>
            <span>⚠️</span>
          </div>
        )}

        <header className="border-b border-zinc-800 bg-slate-950/80 backdrop-blur sticky top-0 z-40">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2 group">
              <span className="text-xl">⚡</span>
              <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-indigo-400 transition-colors">
                PwnLab <span className="text-indigo-400 font-mono">Live</span>
              </span>
            </Link>
            <nav className="flex items-center gap-1 sm:gap-4 text-sm font-medium">
              <Link href="/arena" className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors">
                Arena
              </Link>
              <Link href="/results" className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors">
                Results
              </Link>
              <Link href="/leaderboard" className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors">
                Leaderboard
              </Link>
              <Link href="/ship" className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors">
                Ship Gate
              </Link>
              <Link href="/method" className="px-3 py-1.5 rounded-md text-zinc-300 hover:text-white hover:bg-zinc-800/60 transition-colors">
                Method
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">
          {children}
        </main>

        <footer className="border-t border-zinc-900 py-6 text-center text-xs text-zinc-500">
          <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div>PwnLab Live &copy; 2026 — Flagsmith Experimentation + Gemini Server-side</div>
            <div className="font-mono text-zinc-600">pre-registered on 2026-11-23</div>
          </div>
        </footer>
      </body>
    </html>
  );
}

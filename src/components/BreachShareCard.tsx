'use client';

import React, { useState } from 'react';
import { SudarIcon } from '@/components/SudarIcon';

interface BreachShareCardProps {
  sessionId: string;
  turns: number;
  handle?: string;
  variant?: string;
}

export function BreachShareCard({ sessionId, turns, handle, variant }: BreachShareCardProps) {
  const [copied, setCopied] = useState(false);

  const displayHandle = handle || 'Anonymous Breacher';
  const shareText = `I breached Aria's Vault in ${turns} ${
    turns === 1 ? 'turn' : 'turns'
  } on SudarKalam Arena! 🛡️⚡ Can you break the defense?`;

  const replayUrl = typeof window !== 'undefined' ? `${window.location.origin}/replay/${sessionId}` : `/replay/${sessionId}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
    shareText
  )}&url=${encodeURIComponent(replayUrl)}`;

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(`${shareText}\n${replayUrl}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="sudarkalam-frame p-5 rounded-2xl bg-[#140E0A]/95 border-2 border-[#C23B22]/70 shadow-2xl text-[#FFFFFF] space-y-4">
      <div className="flex items-center justify-between border-b border-[#6C5636]/40 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-[#C23B22]/20 border border-[#C23B22]/50 flex items-center justify-center text-[#FFD6D0]">
            <SudarIcon name="talwars" size={18} />
          </span>
          <div>
            <div className="font-serif font-black text-sm text-[#FFDED9] tracking-wider uppercase">
              Vault Breach Verified
            </div>
            <div className="text-[11px] font-mono text-[#D6CFC4]/70">
              SudarKalam Cryptographic Defense Arena
            </div>
          </div>
        </div>

        <div className="px-3 py-1 rounded-full bg-[#C23B22] text-[#FFFFFF] font-mono text-xs font-black tracking-wider uppercase shadow-md">
          {turns} {turns === 1 ? 'TURN' : 'TURNS'}
        </div>
      </div>

      <div className="p-4 rounded-xl bg-[#090907] border border-[#6C5636]/40 font-mono text-xs space-y-1.5">
        <div className="flex justify-between text-[#D6CFC4]/80">
          <span>Challenger:</span>
          <span className="text-[#FFFFFF] font-bold">{displayHandle}</span>
        </div>
        <div className="flex justify-between text-[#D6CFC4]/80">
          <span>Session ID:</span>
          <span className="text-[#D6CFC4] font-semibold">{sessionId.slice(0, 12)}...</span>
        </div>
        {variant && (
          <div className="flex justify-between text-[#D6CFC4]/80">
            <span>Defense Arm:</span>
            <span className="text-[#FFFFFF] font-bold uppercase">{variant}</span>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <a
          href={tweetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 py-2 px-4 rounded-xl bg-[#1DA1F2] hover:bg-[#1A91DA] text-[#FFFFFF] font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
        >
          <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <span>Share to X</span>
        </a>

        <button
          type="button"
          onClick={handleCopy}
          className="flex-1 py-2 px-4 rounded-xl border border-[#6C5636]/60 bg-[#1A1612] hover:bg-[#6C5636]/30 text-[#FFFFFF] font-mono font-bold text-xs flex items-center justify-center gap-2 transition-all shadow-md"
        >
          <SudarIcon name="manuscript" size={14} />
          <span>{copied ? 'Copied Link!' : 'Copy Share Card'}</span>
        </button>
      </div>
    </div>
  );
}

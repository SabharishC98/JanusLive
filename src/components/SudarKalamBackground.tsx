'use client';

import React from 'react';
import Image from 'next/image';

export function SudarKalamBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#090907]"
    >
      {/* ── Central Container for the SudarKalam Arena & Revolving Dragon GIF ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[96vw] h-[92vh] max-w-[1400px] max-h-[900px] pointer-events-none flex items-center justify-center">
          {/* Ambient Bronze Glow behind the arena */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[380px] rounded-full bg-[#6C5636]/15 blur-3xl pointer-events-none z-0" />

          {/* AI-Generated SudarKalam Arena & Seamless Dragon Flight Animation */}
          <div className="relative w-full h-full z-[1] opacity-90 transition-opacity">
            <Image
              src="/images/sudarkalam_dragon_flight.gif"
              alt="SudarKalam Arena with Dragon Revolving"
              fill
              unoptimized
              priority
              className="object-contain"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

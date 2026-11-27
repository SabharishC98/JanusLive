'use client';

import React from 'react';
import Image from 'next/image';

export function SudarKalamBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#090907]"
    >
      {/* ── 1. Central Container for the 1024x1024 Artwork ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[92vw] h-[92vh] max-w-[1200px] max-h-[1200px] pointer-events-none">
          {/* Base Artwork Layer: Stable Central Colosseum Arena (Dragon Separated Out) */}
          <div className="absolute inset-0 z-0 opacity-85 transition-opacity">
            <Image
              src="/images/sudarkalam_arena_only.jpg"
              alt="SudarKalam Central Arena Colosseum"
              fill
              priority
              className="object-contain filter invert contrast-125 brightness-110"
            />
          </div>

          {/* Antique bronze ambient glow behind the arena */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[300px] rounded-full bg-[#6C5636]/20 blur-3xl pointer-events-none z-0" />

          {/* Orbital path guide around the colosseum rim */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[540px] h-[320px] rounded-[50%] border border-[#6C5636]/25 border-dashed pointer-events-none z-0" />

          {/* ── 2. The Original Logo Dragon Revolving in 3D Around the Arena ── */}
          {/* Passes behind the colosseum at the back, and in front of the arena at the forth */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 pointer-events-none">
            <div className="absolute -top-24 -left-24 w-48 h-48 sm:w-56 sm:h-56 animate-[dragon-orbit-back-forth_20s_linear_infinite]">
              <div className="w-full h-full animate-[dragon-flying-slither_2s_ease-in-out_infinite_alternate]">
                <Image
                  src="/images/logo_dragon_clean.png"
                  alt="Original Logo Dragon in Flight"
                  fill
                  priority
                  className="object-contain filter drop-shadow-[0_0_14px_rgba(212,175,55,0.7)]"
                />
              </div>
            </div>
          </div>

          {/* ── 3. Arena Front Wall Occlusion Layer ── */}
          {/* Positioned precisely over the colosseum front wall (z-15) */}
          {/* Dragon passes BEHIND this wall when at z-5 (back of arena), and in FRONT at z-30 (front of arena) */}
          <div
            className="absolute top-[52.2%] left-[28.3%] w-[43.4%] h-[11.7%] pointer-events-none z-[15] opacity-95"
            aria-hidden="true"
          >
            <Image
              src="/images/arena_front_wall.png"
              alt="Arena Colosseum Front Wall"
              fill
              priority
              className="object-contain filter brightness-105"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

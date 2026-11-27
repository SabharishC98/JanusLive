'use client';

import React from 'react';
import Image from 'next/image';

export function SudarKalamBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#090907]"
    >
      {/* Subtle ancient parchment texture / noise overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(#6C5636_1px,transparent_1px)] [background-size:32px_32px] opacity-[0.07]" />

      {/* Ambient spiritual glow radiating from center */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] sm:w-[800px] sm:h-[800px] rounded-full bg-gradient-to-tr from-[#6C5636]/15 via-[#899D73]/10 to-transparent blur-3xl pointer-events-none" />

      {/* Centerpiece: The SudarKalam Colosseum Arena Emblem */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[340px] h-[340px] sm:w-[480px] sm:h-[480px] flex items-center justify-center pointer-events-none">
        {/* Soft edge radial mask around the center emblem */}
        <div className="relative w-full h-full rounded-full overflow-hidden opacity-30 mix-blend-screen shadow-[0_0_80px_rgba(108,86,54,0.3)]">
          <Image
            src="/images/sudarkalam-bg.jpg"
            alt="SudarKalam Arena"
            fill
            priority
            className="object-cover scale-110 filter brightness-90 contrast-125"
          />
          {/* Circular gradient vignette overlay to seamlessly melt the image edges into #090907 */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_35%,#090907_80%,#090907_100%)]" />
        </div>

        {/* Orbit track ring with ancient etched glyph dashes */}
        <div className="absolute inset-0 rounded-full border border-[#6C5636]/25 border-dashed animate-[spin_120s_linear_infinite]" />
        <div className="absolute inset-8 rounded-full border border-[#899D73]/20" />
      </div>

      {/* Revolving Dragon / Naga Astral Beast */}
      {/* Rotates continuously around the center arena like a living GIF */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] sm:w-[580px] sm:h-[580px] pointer-events-none animate-[dragon-revolve_30s_linear_infinite]">
        <svg
          viewBox="0 0 600 600"
          className="w-full h-full overflow-visible drop-shadow-[0_0_12px_rgba(137,157,115,0.4)]"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            {/* Dragon Bronze & Sage metallic gradient */}
            <linearGradient id="dragon-gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#899D73" stopOpacity="0.95" />
              <stop offset="50%" stopColor="#D4AF37" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#6C5636" stopOpacity="0.75" />
            </linearGradient>

            <filter id="dragon-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Glowing orbital energy arc trailing behind the dragon */}
          <path
            d="M 300 30 A 270 270 0 0 1 570 300"
            stroke="url(#dragon-gold-gradient)"
            strokeWidth="2.5"
            strokeDasharray="6 8"
            strokeLinecap="round"
            opacity="0.6"
          />
          <path
            d="M 570 300 A 270 270 0 0 1 450 515"
            stroke="#6C5636"
            strokeWidth="1.5"
            strokeDasharray="2 6"
            opacity="0.3"
          />

          {/* Dragon / Yali Naga Body positioned along the top-right perimeter of the orbit */}
          <g transform="translate(300, 30) rotate(88)" filter="url(#dragon-glow)">
            {/* Dragon Head */}
            <path
              d="M 0 0 C 10 -15, 25 -20, 42 -14 C 48 -12, 54 -4, 52 4 C 50 12, 42 16, 32 15 C 22 24, 10 20, 0 10 Z"
              fill="#090907"
              stroke="#899D73"
              strokeWidth="2.5"
            />
            {/* Horns & Crown */}
            <path
              d="M 12 -18 C 15 -32, 28 -40, 32 -48 C 28 -38, 22 -30, 20 -20"
              stroke="#D4AF37"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M 22 -16 C 30 -28, 42 -35, 48 -42 C 42 -32, 34 -25, 30 -16"
              stroke="#6C5636"
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Dragon Eye */}
            <circle cx="28" cy="-4" r="3.5" fill="#899D73" />
            <circle cx="29" cy="-4" r="1.5" fill="#F5F2EB" />
            {/* Snout & Whiskers */}
            <path
              d="M 48 0 C 65 5, 80 -8, 92 -6"
              stroke="#899D73"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.85"
            />
            <path
              d="M 45 8 C 60 18, 75 14, 88 22"
              stroke="#6C5636"
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity="0.85"
            />
            {/* Fangs & Jaw */}
            <path d="M 40 8 L 43 14 L 46 8" fill="#F5F2EB" />
            <path d="M 32 10 L 35 15 L 38 10" fill="#F5F2EB" />

            {/* Serpentine Body Coils */}
            <path
              d="M 0 0 C -25 8, -50 -10, -80 -2 C -110 6, -135 -15, -170 -6 C -205 3, -230 -12, -260 0 C -285 10, -310 -5, -340 0"
              fill="none"
              stroke="url(#dragon-gold-gradient)"
              strokeWidth="6"
              strokeLinecap="round"
            />
            {/* Dragon Underbelly scales */}
            <path
              d="M 0 5 C -25 13, -50 -5, -80 3 C -110 11, -135 -10, -170 -1 C -205 8, -230 -7, -260 5 C -285 15, -310 0, -340 5"
              fill="none"
              stroke="#6C5636"
              strokeWidth="2"
              strokeDasharray="4 4"
            />
            {/* Dorsal Spine Fins */}
            {[-30, -60, -90, -120, -150, -180, -210, -240, -270, -300].map((x, i) => (
              <path
                key={i}
                d={`M ${x} ${i % 2 === 0 ? -12 : -8} L ${x - 8} ${i % 2 === 0 ? -24 : -18} L ${x - 14} ${i % 2 === 0 ? -8 : -5}`}
                fill="#899D73"
                stroke="#6C5636"
                strokeWidth="1"
                opacity="0.8"
              />
            ))}
            {/* Claws & Talons */}
            <g transform="translate(-70, 5)">
              <path d="M 0 0 L 8 16 L 2 24 M 6 18 L 14 22 M 2 16 L -4 22" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" />
            </g>
            <g transform="translate(-190, 5)">
              <path d="M 0 0 L 8 16 L 2 24 M 6 18 L 14 22 M 2 16 L -4 22" stroke="#899D73" strokeWidth="2" strokeLinecap="round" />
            </g>

            {/* Flaming Tail Tuft */}
            <g transform="translate(-340, 2)">
              <path
                d="M 0 0 C -15 -10, -30 -5, -45 -18 C -35 2, -48 10, -60 12 C -42 16, -30 10, -20 22 C -15 12, -8 6, 0 0 Z"
                fill="url(#dragon-gold-gradient)"
                opacity="0.85"
              />
            </g>
          </g>

          {/* Floating magical energy spark motes orbiting along the path */}
          <circle cx="530" cy="180" r="2.5" fill="#899D73" opacity="0.8" />
          <circle cx="580" cy="340" r="2" fill="#D4AF37" opacity="0.6" />
          <circle cx="480" cy="480" r="3" fill="#6C5636" opacity="0.7" />
          <circle cx="210" cy="565" r="2" fill="#899D73" opacity="0.5" />
          <circle cx="80" cy="420" r="2.5" fill="#D4AF37" opacity="0.6" />
        </svg>
      </div>

      {/* Screen Vignette Gradient — keeps content 100% legible and readable */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#090907]/90 via-[#090907]/75 to-[#090907]/95 pointer-events-none" />
    </div>
  );
}

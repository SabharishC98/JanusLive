'use client';

import React from 'react';
import Image from 'next/image';

export function SudarKalamBackground() {
  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#090907]"
    >
      {/* ── 1. The Stable Artwork Layer (Clearly Visible Engraving) ── */}
      {/* The central logo and arena remain completely stable at the center */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="relative w-[92vw] h-[92vh] max-w-[1250px] max-h-[1250px] opacity-85 transition-opacity">
          <Image
            src="/images/sudarkalam-bg.jpg"
            alt="SudarKalam Central Arena Logo and Artwork"
            fill
            priority
            className="object-contain filter invert contrast-125 brightness-110"
          />
        </div>
      </div>

      {/* Subtle antique bronze ambient radiance behind the arena */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[320px] rounded-full bg-[#6C5636]/20 blur-3xl pointer-events-none" />

      {/* ── 2. The Real Flying Dragon Revolving Around the Central Arena ── */}
      {/* Centered exactly on the arena colosseum */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-0 h-0 pointer-events-none">
        {/* Subtle orbital trajectory indicator around the arena rim */}
        <div
          className="absolute -top-[170px] -left-[280px] w-[560px] h-[340px] rounded-[50%] border border-[#6C5636]/25 border-dashed pointer-events-none"
        />

        {/* Dragon entity following the 3D elliptical flight orbit */}
        <div className="absolute -top-16 -left-20 w-40 h-28 animate-[dragon-arena-flight_18s_linear_infinite]">
          {/* Dragon Graphic with flapping wings and serpentine undulating body */}
          <svg
            viewBox="0 0 200 120"
            className="w-full h-full overflow-visible drop-shadow-[0_0_10px_rgba(212,175,55,0.7)]"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="dragon-gold-live" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="35%" stopColor="#D4AF37" />
                <stop offset="75%" stopColor="#6C5636" />
                <stop offset="100%" stopColor="#1A140A" />
              </linearGradient>

              <linearGradient id="wing-membrane-live" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.6" />
                <stop offset="40%" stopColor="#D4AF37" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#6C5636" stopOpacity="0.1" />
              </linearGradient>
            </defs>

            {/* Slithering Serpentine Body */}
            <g className="animate-[dragon-body-slither_2s_ease-in-out_infinite_alternate]">
              {/* Spine line */}
              <path
                d="M 165 58 Q 135 44, 105 58 T 55 58 T 12 60"
                fill="none"
                stroke="url(#dragon-gold-live)"
                strokeWidth="5"
                strokeLinecap="round"
              />

              {/* Glowing scale etching */}
              <path
                d="M 163 60 Q 133 46, 103 60 T 53 60 T 13 62"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeDasharray="3 3"
              />

              {/* Dorsal crest ridges */}
              {[140, 120, 100, 80, 60, 40, 20].map((x, i) => (
                <path
                  key={i}
                  d={`M ${x} 54 L ${x - 4} 45 L ${x - 8} 55`}
                  fill="#D4AF37"
                  stroke="#6C5636"
                  strokeWidth="1"
                />
              ))}

              {/* Tail fire flare */}
              <path
                d="M 12 60 C 2 54, -10 66, -18 58 C -12 64, -15 72, -8 74 C -1 72, 5 66, 12 60 Z"
                fill="url(#dragon-gold-live)"
              />
              <circle cx="-14" cy="60" r="1.8" fill="#FFFFFF" className="animate-ping" />

              {/* Talons & Claws */}
              <g transform="translate(120, 62)">
                <path d="M 0 0 L 3 10 L -2 15 M 2 11 L 6 14" stroke="#FFFFFF" strokeWidth="1.2" strokeLinecap="round" />
              </g>
              <g transform="translate(70, 61)">
                <path d="M 0 0 L 3 10 L -2 15 M 2 11 L 6 14" stroke="#D4AF37" strokeWidth="1.2" strokeLinecap="round" />
              </g>

              {/* Flapping Wing (Upper) */}
              <g className="origin-[110px_52px] animate-[dragon-wing-top_1s_ease-in-out_infinite_alternate]">
                <path
                  d="M 110 52 Q 125 15, 150 -8 Q 130 6, 106 22 Q 92 10, 78 27 Q 96 40, 110 52 Z"
                  fill="url(#wing-membrane-live)"
                  stroke="#D4AF37"
                  strokeWidth="1.4"
                />
                <path d="M 110 52 L 150 -8 M 110 52 L 106 22 M 110 52 L 78 27" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.85" />
              </g>

              {/* Flapping Wing (Lower) */}
              <g className="origin-[110px_62px] animate-[dragon-wing-bottom_1s_ease-in-out_infinite_alternate]">
                <path
                  d="M 110 62 Q 128 82, 144 110 Q 122 88, 100 78 Q 86 90, 75 76 Q 94 69, 110 62 Z"
                  fill="url(#wing-membrane-live)"
                  stroke="#6C5636"
                  strokeWidth="1.4"
                />
                <path d="M 110 62 L 144 110 M 110 62 L 100 78" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.6" />
              </g>

              {/* Fierce Temple Dragon Head */}
              <g transform="translate(165, 58)">
                <path
                  d="M 0 0 C 6 -7, 15 -9, 22 -5 C 26 -3, 28 2, 26 7 C 22 11, 16 11, 9 9 C 5 11, 2 7, 0 0 Z"
                  fill="#090907"
                  stroke="#D4AF37"
                  strokeWidth="1.8"
                />
                {/* Horns */}
                <path d="M 7 -7 C 13 -16, 22 -22, 30 -27 C 24 -20, 18 -14, 14 -7" stroke="#FFFFFF" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M 13 -5 C 18 -12, 27 -16, 34 -20 C 29 -14, 23 -10, 18 -5" stroke="#D4AF37" strokeWidth="1.3" strokeLinecap="round" />
                {/* Glowing Eye */}
                <circle cx="14" cy="-2" r="2.2" fill="#FFFFFF" />
                <circle cx="14" cy="-2" r="1" fill="#090907" />
                {/* Jaws & Fangs */}
                <path d="M 22 -3 L 31 -1 L 29 4 L 22 3" stroke="#D4AF37" strokeWidth="1.3" fill="#090907" />
                <path d="M 25 3 L 27 7 L 29 3" fill="#FFFFFF" />
                {/* Whisker Filaments */}
                <path d="M 28 -1 C 38 -4, 48 2, 55 5" stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" opacity="0.9" />
                <path d="M 26 4 C 35 11, 44 9, 51 14" stroke="#D4AF37" strokeWidth="1" strokeLinecap="round" opacity="0.8" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

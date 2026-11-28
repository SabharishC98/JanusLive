'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';

export function SudarKalamBackground() {
  const [isFlying, setIsFlying] = useState(false);
  const [promptSnippet, setPromptSnippet] = useState<string | null>(null);
  const [hasDelivered, setHasDelivered] = useState(false);

  useEffect(() => {
    const handlePromptInflight = (e: Event) => {
      const customEvent = e as CustomEvent<{ prompt?: string }>;
      const text = customEvent.detail?.prompt;
      if (text) {
        setPromptSnippet(text.length > 28 ? `${text.slice(0, 28)}...` : text);
      }
      setHasDelivered(false);
      setIsFlying(true);
    };

    const handlePromptResolved = () => {
      setHasDelivered(true);
      // Allow the dragon to complete its landing descent and sit smoothly
      setTimeout(() => {
        setIsFlying(false);
        setPromptSnippet(null);
        setTimeout(() => setHasDelivered(false), 2400);
      }, 1200);
    };

    window.addEventListener('sudarkalam:prompt-inflight', handlePromptInflight);
    window.addEventListener('sudarkalam:prompt-resolved', handlePromptResolved);

    return () => {
      window.removeEventListener('sudarkalam:prompt-inflight', handlePromptInflight);
      window.removeEventListener('sudarkalam:prompt-resolved', handlePromptResolved);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none bg-[#090907]"
    >
      {/* ── Compact & Fantastic Ancient Dragon Sanctum ── */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none pt-4 sm:pt-6">
        <div className="relative w-[92vw] max-w-[620px] h-[320px] sm:h-[350px] pointer-events-none flex items-center justify-center">
          
          {/* 1. Ambient Bronze & Gold Pulsing Core */}
          <div
            className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[440px] h-[280px] rounded-full blur-3xl transition-all duration-700 pointer-events-none z-0 ${
              isFlying
                ? 'bg-[#D4AF37]/35 scale-110'
                : 'bg-[#6C5636]/25 scale-100'
            }`}
          />

          {/* 2. Mystical Concentric Celestial Rune Rings */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[380px] h-[380px] sm:w-[440px] sm:h-[440px] pointer-events-none z-0 opacity-65">
            {/* Outer Astrological Rune Ring */}
            <svg
              className="absolute inset-0 w-full h-full animate-[rune-spin-clockwise_60s_linear_infinite]"
              viewBox="0 0 400 400"
              fill="none"
            >
              <circle
                cx="200"
                cy="200"
                r="185"
                stroke="#6C5636"
                strokeWidth="1.2"
                strokeDasharray="4 8"
                opacity="0.75"
              />
              <circle
                cx="200"
                cy="200"
                r="170"
                stroke="#D4AF37"
                strokeWidth="0.8"
                strokeDasharray="20 12 4 12"
                opacity="0.85"
              />
              {/* Rune Hash Marks */}
              {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                <line
                  key={deg}
                  x1="200"
                  y1="16"
                  x2="200"
                  y2="28"
                  stroke="#D4AF37"
                  strokeWidth="1.5"
                  transform={`rotate(${deg} 200 200)`}
                  opacity="0.9"
                />
              ))}
            </svg>

            {/* Inner Sacred Geometric Mandala */}
            <svg
              className="absolute inset-0 w-full h-full animate-[rune-spin-counter_38s_linear_infinite]"
              viewBox="0 0 400 400"
              fill="none"
            >
              <circle
                cx="200"
                cy="200"
                r="140"
                stroke="#6C5636"
                strokeWidth="1"
                strokeDasharray="6 6"
                opacity="0.6"
              />
              <circle
                cx="200"
                cy="200"
                r="120"
                stroke="#F5F2EB"
                strokeWidth="0.75"
                strokeDasharray="40 10 10 10"
                opacity="0.7"
              />
              {/* 4 Cardinal Temple Diamonds */}
              {[0, 90, 180, 270].map((deg) => (
                <rect
                  key={deg}
                  x="196"
                  y="62"
                  width="8"
                  height="8"
                  fill="#D4AF37"
                  transform={`rotate(${deg} 200 200)`}
                  opacity="0.8"
                />
              ))}
            </svg>
          </div>

          {/* 3. Floating Mystical Embers */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden z-[2]">
            <span className="absolute bottom-10 left-[25%] w-1.5 h-1.5 rounded-full bg-[#D4AF37] animate-[ember-rise_4s_ease-in-out_infinite]" />
            <span className="absolute bottom-16 right-[28%] w-1 h-1 rounded-full bg-[#F5F2EB] animate-[ember-rise_5s_ease-in-out_infinite_1.2s]" />
            <span className="absolute bottom-8 left-[45%] w-1.5 h-1.5 rounded-full bg-[#6C5636] animate-[ember-rise_4.5s_ease-in-out_infinite_2.4s]" />
            <span className="absolute bottom-14 right-[42%] w-2 h-2 rounded-full bg-[#D4AF37] animate-[ember-rise_3.8s_ease-in-out_infinite_0.8s]" />
          </div>

          {/* 4. The Central Compact Arena & Dragon Stage */}
          <div className="relative w-full h-full z-[1] transition-all duration-700">
            {/* IDLE: Dragon Sitting in Center */}
            <div
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isFlying ? 'opacity-0 scale-95 pointer-events-none' : 'opacity-65 scale-100'
              }`}
            >
              <div className="relative w-full h-full animate-[dragon-breathe_5s_ease-in-out_infinite]">
                <Image
                  src="/images/dragon_sitting.png"
                  alt="SudarKalam Sentinel Dragon Sitting in Temple Arena"
                  fill
                  unoptimized
                  priority
                  className="object-contain"
                />
              </div>
            </div>

            {/* IN FLIGHT: Dragon Circling the Arena Carrying the Prompt */}
            <div
              className={`absolute inset-0 transition-opacity duration-700 ease-in-out ${
                isFlying ? 'opacity-90 scale-100' : 'opacity-0 scale-105 pointer-events-none'
              }`}
            >
              <Image
                src="/images/sudarkalam_dragon_flight.gif"
                alt="SudarKalam Dragon Flying Around Arena Delivering Prompt"
                fill
                unoptimized
                priority
                className="object-contain filter drop-shadow-[0_0_16px_rgba(212,175,55,0.4)]"
              />

              {/* Glowing Golden Carrier Orb (Represents Prompt Payload Carried by Dragon) */}
              <div className="absolute top-1/2 left-1/2 w-0 h-0 pointer-events-none">
                <div className="absolute w-5 h-5 -top-2.5 -left-2.5 rounded-full bg-[#D4AF37] blur-[2px] animate-[carrier-orbit_3.5s_linear_infinite] shadow-[0_0_18px_#D4AF37]">
                  <span className="absolute inset-0.5 rounded-full bg-[#FFFFFF]" />
                </div>
              </div>
            </div>

            {/* Subtle Vignette Mask so edges fade cleanly into dark theme */}
            <div className="absolute inset-0 bg-radial-vignette pointer-events-none z-[3]" />
          </div>

          {/* 5. Mystical Flight Status Ribbon */}
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 z-[4] whitespace-nowrap pointer-events-none">
            {isFlying ? (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#090907]/90 border border-[#D4AF37]/70 text-[#FFFFFF] font-mono text-[10px] tracking-wider uppercase shadow-xl animate-pulse">
                <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping" />
                <span className="text-[#D4AF37] font-bold">DRAGON CARRYING PROMPT:</span>
                <span className="text-[#F5F2EB]/90 max-w-[200px] truncate">
                  {promptSnippet ? `&ldquo;${promptSnippet}&rdquo;` : 'Navigating Vault...'}
                </span>
              </div>
            ) : hasDelivered ? (
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#090907]/90 border border-[#6C5636]/60 text-[#D2F5B0] font-mono text-[10px] tracking-wider uppercase shadow-xl">
                <span className="text-xs">✦</span>
                <span>Response Retrieved &bull; Dragon Settled</span>
              </div>
            ) : null}
          </div>

        </div>
      </div>
    </div>
  );
}

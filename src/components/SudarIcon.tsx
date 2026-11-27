'use client';

import React from 'react';
import Image from 'next/image';

export type SudarIconName =
  | 'talwars'
  | 'shield'
  | 'trophy'
  | 'vault'
  | 'dragon'
  | 'manuscript';

interface SudarIconProps {
  name: SudarIconName;
  size?: number;
  className?: string;
  alt?: string;
}

const ICON_MAP: Record<SudarIconName, string> = {
  talwars: '/images/icons/talwars.jpg',
  shield: '/images/icons/shield.jpg',
  trophy: '/images/icons/trophy.jpg',
  vault: '/images/icons/vault.jpg',
  dragon: '/images/icons/dragon.jpg',
  manuscript: '/images/icons/manuscript.jpg',
};

/**
 * SudarIcon
 * Renders custom temple-engraved woodcut line-art icons that match
 * the SudarKalam arena logo aesthetic.
 * Linework is inverted to crisp ivory/bronze lines on dark surfaces.
 */
export function SudarIcon({ name, size = 20, className = '', alt = '' }: SudarIconProps) {
  const src = ICON_MAP[name] || ICON_MAP.talwars;

  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 overflow-hidden select-none ${className}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <Image
        src={src}
        alt={alt || `${name} icon`}
        width={size * 2}
        height={size * 2}
        className="w-full h-full object-contain filter invert contrast-150 brightness-110 mix-blend-screen"
        loading="eager"
      />
    </span>
  );
}

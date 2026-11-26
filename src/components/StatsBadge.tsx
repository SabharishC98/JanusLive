import React from 'react';

interface StatsBadgeProps {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'indigo';
  sublabel?: string;
}

export function StatsBadge({ label, value, variant = 'default', sublabel }: StatsBadgeProps) {
  const variantStyles = {
    default: 'bg-zinc-900 border-zinc-800 text-zinc-100',
    success: 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300',
    danger: 'bg-rose-950/30 border-rose-800/50 text-rose-300',
    warning: 'bg-amber-950/30 border-amber-800/50 text-amber-300',
    indigo: 'bg-indigo-950/30 border-indigo-800/50 text-indigo-300',
  };

  return (
    <div className={`p-4 rounded-xl border flex flex-col justify-between ${variantStyles[variant]}`}>
      <span className="text-xs uppercase font-mono tracking-wider opacity-75">{label}</span>
      <span className="text-2xl font-bold font-mono my-1">{value}</span>
      {sublabel && <span className="text-xs opacity-60 font-sans">{sublabel}</span>}
    </div>
  );
}

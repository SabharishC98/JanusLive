import React from 'react';

interface StatsBadgeProps {
  label: string;
  value: string | number;
  variant?: 'default' | 'success' | 'danger' | 'warning' | 'indigo';
  sublabel?: string;
}

export function StatsBadge({ label, value, variant = 'default', sublabel }: StatsBadgeProps) {
  const variantStyles = {
    default: 'bg-[#FFF7EE] border-[#E7D5C0] text-[#1C1917]',
    success: 'bg-[#ECFCCB] border-[#BEF264] text-[#365314]',
    danger: 'bg-[#FEE2E2] border-[#FCA5A5] text-[#991B1B]',
    warning: 'bg-[#FEF3C7] border-[#FCD34D] text-[#92400E]',
    indigo: 'bg-[#FFF7EE] border-[#1C1917] text-[#1C1917]',
  };

  return (
    <div className={`p-4 rounded-2xl border shadow-sm flex flex-col justify-between ${variantStyles[variant]}`}>
      <span className="text-xs uppercase font-mono tracking-wider font-semibold opacity-80">{label}</span>
      <span className="text-2xl font-black font-mono my-1">{value}</span>
      {sublabel && <span className="text-xs opacity-75 font-sans font-medium">{sublabel}</span>}
    </div>
  );
}

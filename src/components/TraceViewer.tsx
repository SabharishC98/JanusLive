'use client';

import React, { useState } from 'react';

export interface TraceItem {
  name: string;
  fired: boolean;
  score: number;
  detail?: string;
}

interface TraceViewerProps {
  inputTrace?: TraceItem[];
  outputTrace?: TraceItem[];
  latencyMs?: number | null;
  tokensUsed?: number | null;
  costUsd?: number | null;
}

export function TraceViewer({ inputTrace = [], outputTrace = [], latencyMs, tokensUsed, costUsd }: TraceViewerProps) {
  const [open, setOpen] = useState(false);
  const totalLayers = inputTrace.length + outputTrace.length;
  const anyFired = inputTrace.some((t) => t.fired) || outputTrace.some((t) => t.fired);

  if (totalLayers === 0 && !latencyMs) return null;

  return (
    <div className="mt-2 text-xs font-mono border border-[#E7D5C0] rounded-xl bg-[#FFF7EE] overflow-hidden shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3.5 py-2 flex items-center justify-between text-[#1C1917] hover:bg-[#F9EAD7] transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${anyFired ? 'bg-[#E10600] animate-pulse' : 'bg-[#4D7C0F]'}`} />
          <span className="font-bold">Defense Trace ({totalLayers} layers)</span>
          {anyFired && <span className="text-[#E10600] font-black">[LAYER TRIGGERED]</span>}
        </span>
        <span className="flex items-center gap-3 text-[#78716C] font-semibold">
          {latencyMs != null && <span>{latencyMs}ms</span>}
          {tokensUsed != null && <span>~{tokensUsed} toks</span>}
          {costUsd != null && <span>${costUsd.toFixed(5)}</span>}
          <span className="text-[#1C1917]">{open ? '▲ hide' : '▼ show'}</span>
        </span>
      </button>

      {open && (
        <div className="p-3.5 border-t border-[#E7D5C0] space-y-3 bg-[#F9EAD7]/50">
          {inputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-[#78716C] mb-1.5 font-black">Input Inspection Layers</div>
              <div className="space-y-1">
                {inputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#FFF7EE] border border-[#E7D5C0]">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${layer.fired ? 'bg-[#FEE2E2] text-[#E10600] border border-[#FCA5A5]' : 'bg-[#ECFCCB] text-[#4D7C0F] border border-[#D9F99D]'}`}>
                        {layer.fired ? 'FIRED' : 'CLEAN'}
                      </span>
                      <span className="text-[#1C1917] font-semibold">{layer.name}</span>
                      {layer.detail && <span className="text-[#78716C] text-[10px]">({layer.detail})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-[#E7D5C0] h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${layer.fired ? 'bg-[#E10600]' : 'bg-[#4D7C0F]'}`}
                          style={{ width: `${Math.min(100, Math.max(5, layer.score * 100))}%` }}
                        />
                      </div>
                      <span className="text-[#78716C] text-[10px] w-8 text-right font-bold">{layer.score.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-[#78716C] mb-1.5 font-black">Output Containment Layers</div>
              <div className="space-y-1">
                {outputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#FFF7EE] border border-[#E7D5C0]">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-black ${layer.fired ? 'bg-[#FEE2E2] text-[#E10600] border border-[#FCA5A5]' : 'bg-[#ECFCCB] text-[#4D7C0F] border border-[#D9F99D]'}`}>
                        {layer.fired ? 'BLOCKED' : 'CLEAN'}
                      </span>
                      <span className="text-[#1C1917] font-semibold">{layer.name}</span>
                      {layer.detail && <span className="text-[#78716C] text-[10px]">({layer.detail})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-[#E7D5C0] h-2 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${layer.fired ? 'bg-[#E10600]' : 'bg-[#4D7C0F]'}`}
                          style={{ width: `${Math.min(100, Math.max(5, layer.score * 100))}%` }}
                        />
                      </div>
                      <span className="text-[#78716C] text-[10px] w-8 text-right font-bold">{layer.score.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

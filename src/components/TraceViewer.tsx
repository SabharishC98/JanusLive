'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, ShieldCheck, AlertCircle } from 'lucide-react';

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
    <div className="mt-2.5 text-xs font-mono border border-[#6C5636]/40 rounded-xl bg-[#090907]/90 overflow-hidden shadow-md">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between text-[#F5F2EB] hover:bg-[#6C5636]/20 transition-colors"
      >
        <span className="flex items-center gap-2">
          {anyFired ? (
            <AlertCircle className="w-4 h-4 text-[#C23B22] animate-pulse" />
          ) : (
            <ShieldCheck className="w-4 h-4 text-[#899D73]" />
          )}
          <span className="font-bold text-[#F5F2EB]">Defense Trace ({totalLayers} layers)</span>
          {anyFired && <span className="text-[#C23B22] font-black text-[10px] uppercase tracking-wider">[LAYER TRIGGERED]</span>}
        </span>
        <span className="flex items-center gap-3 text-[#D6CFC4]/70 font-medium">
          {latencyMs != null && <span className="text-[#899D73] font-bold">{latencyMs}ms</span>}
          {tokensUsed != null && <span>~{tokensUsed} toks</span>}
          {costUsd != null && <span>${costUsd.toFixed(5)}</span>}
          <span className="text-[#899D73] flex items-center">
            {open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </span>
        </span>
      </button>

      {open && (
        <div className="p-3.5 border-t border-[#6C5636]/30 space-y-3 bg-[#13120E]/80">
          {inputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-[#899D73] mb-1.5 font-bold">
                Input Inspection Layers
              </div>
              <div className="space-y-1">
                {inputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#090907] border border-[#6C5636]/30">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          layer.fired
                            ? 'bg-[#C23B22]/20 text-[#C23B22] border border-[#C23B22]/50'
                            : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
                        }`}
                      >
                        {layer.fired ? 'FIRED' : 'CLEAN'}
                      </span>
                      <span className="text-[#F5F2EB] font-medium">{layer.name}</span>
                      {layer.detail && <span className="text-[#D6CFC4]/60 text-[10px]">({layer.detail})</span>}
                    </div>
                    <span className="text-[#899D73] font-bold text-[11px]">{layer.score.toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-[#899D73] mb-1.5 font-bold">
                Output Leak Inspection Layers
              </div>
              <div className="space-y-1">
                {outputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-[#090907] border border-[#6C5636]/30">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-black ${
                          layer.fired
                            ? 'bg-[#C23B22]/20 text-[#C23B22] border border-[#C23B22]/50'
                            : 'bg-[#899D73]/20 text-[#899D73] border border-[#899D73]/40'
                        }`}
                      >
                        {layer.fired ? 'FIRED' : 'CLEAN'}
                      </span>
                      <span className="text-[#F5F2EB] font-medium">{layer.name}</span>
                      {layer.detail && <span className="text-[#D6CFC4]/60 text-[10px]">({layer.detail})</span>}
                    </div>
                    <span className="text-[#899D73] font-bold text-[11px]">{layer.score.toFixed(2)}</span>
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

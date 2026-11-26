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
    <div className="mt-2 text-xs font-mono border border-zinc-800 rounded-md bg-zinc-950/60 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-1.5 flex items-center justify-between text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${anyFired ? 'bg-amber-400 animate-pulse' : 'bg-emerald-500'}`} />
          <span className="font-semibold">Defense Trace ({totalLayers} layers)</span>
          {anyFired && <span className="text-amber-400 font-bold">[LAYER TRIGGERED]</span>}
        </span>
        <span className="flex items-center gap-3 text-zinc-500">
          {latencyMs != null && <span>{latencyMs}ms</span>}
          {tokensUsed != null && <span>~{tokensUsed} toks</span>}
          {costUsd != null && <span>${costUsd.toFixed(5)}</span>}
          <span>{open ? '▲ hide' : '▼ show'}</span>
        </span>
      </button>

      {open && (
        <div className="p-3 border-t border-zinc-800 space-y-3 bg-zinc-900/30">
          {inputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-zinc-500 mb-1 font-bold">Input Inspection Layers</div>
              <div className="space-y-1">
                {inputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-zinc-900/80 border border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${layer.fired ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'}`}>
                        {layer.fired ? 'FIRED' : 'CLEAN'}
                      </span>
                      <span className="text-zinc-300">{layer.name}</span>
                      {layer.detail && <span className="text-zinc-500 text-[10px]">({layer.detail})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${layer.fired ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, Math.max(5, layer.score * 100))}%` }}
                        />
                      </div>
                      <span className="text-zinc-400 text-[10px] w-8 text-right">{layer.score.toFixed(2)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outputTrace.length > 0 && (
            <div>
              <div className="text-[10px] tracking-wider uppercase text-zinc-500 mb-1 font-bold">Output Containment Layers</div>
              <div className="space-y-1">
                {outputTrace.map((layer, idx) => (
                  <div key={idx} className="flex items-center justify-between p-1.5 rounded bg-zinc-900/80 border border-zinc-800">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${layer.fired ? 'bg-rose-500/20 text-rose-400 border border-rose-500/40' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'}`}>
                        {layer.fired ? 'BLOCKED' : 'CLEAN'}
                      </span>
                      <span className="text-zinc-300">{layer.name}</span>
                      {layer.detail && <span className="text-zinc-500 text-[10px]">({layer.detail})</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${layer.fired ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${Math.min(100, Math.max(5, layer.score * 100))}%` }}
                        />
                      </div>
                      <span className="text-zinc-400 text-[10px] w-8 text-right">{layer.score.toFixed(2)}</span>
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

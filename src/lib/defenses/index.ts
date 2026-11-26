export interface LayerTrace {
  name: string;
  fired: boolean;
  score: number;
  detail?: string;
}

export interface Prepared {
  systemPrompt: string;
  userMessage: string;
  blocked: boolean;
  blockReason?: string;
  inputTrace: LayerTrace[];
}

export interface Result {
  output: string;
  blocked: boolean;
  blockReason?: string;
  outputTrace: LayerTrace[];
  raw: string;
}

export interface SessionContext {
  sessionId: string;
  identityId: string;
  variant: 'control' | 'lurien';
  canary: string;
  messageIndex: number;
  priorMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface DefenseAdapter {
  prepare(input: string, session: SessionContext): Promise<Prepared>;
  postprocess(output: string, session: SessionContext): Promise<Result>;
  trace(): LayerTrace[];
}

import { ControlAdapter } from './control';
import { HardenedAdapter } from './hardened';
import { LurienAdapter } from './lurien';

export { ControlAdapter, HardenedAdapter, LurienAdapter };

export function createAdapter(variant: 'control' | 'lurien'): DefenseAdapter {
  switch (variant) {
    case 'control': return new ControlAdapter();
    case 'lurien': return new LurienAdapter();
    default: return new ControlAdapter();
  }
}

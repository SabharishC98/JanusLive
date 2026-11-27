// ===== LURIEN CONTRACT =====
// Endpoint:  POST {LURIEN_API_URL} (e.g. https://.../v1/check or http://.../scan)
// Request:   { prompt: string, text: string }
// Headers:   X-API-Key: {LURIEN_API_KEY}, Authorization: Bearer {LURIEN_API_KEY}
// Response:  { blocked: boolean, layers: Array<{ name: string, fired: boolean, score: number }> }
// Errors:    Non-2xx or missing env → throw → caller records error row (never counts as a block)
// ===========================

import { z } from 'zod';
import type { DefenseAdapter, LayerTrace, Prepared, Result, SessionContext } from './index';
import { buildSystemPrompt } from '../prompts';

interface LurienLayer { name: string; fired: boolean; score: number; }

const LurienResponseSchema = z.object({
  blocked: z.boolean().optional(),
  safe: z.boolean().optional(),
  layers: z.union([
    z.array(z.object({ name: z.string(), fired: z.boolean(), score: z.number() }).passthrough()),
    z.record(z.any()),
  ]).optional(),
}).passthrough().refine(
  (d) => d.blocked !== undefined || d.safe !== undefined,
  { message: 'Lurien response must contain either blocked or safe field' }
);

function resolveLurienEndpoint(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/check') || trimmed.endsWith('/scan')) {
    return trimmed;
  }
  return `${trimmed}/v1/check`;
}

async function lurienScan(text: string, canary?: string, retries = 1): Promise<{ blocked: boolean; layers: LurienLayer[]; latencyMs: number }> {
  const url = process.env.LURIEN_API_URL;
  const key = process.env.LURIEN_API_KEY;

  if (!url || !key) {
    throw new Error('LURIEN_API_URL and LURIEN_API_KEY must be set');
  }

  const endpoint = resolveLurienEndpoint(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const lurienStart = Date.now();
      const payload: Record<string, any> = { prompt: text, text };
      if (canary) {
        payload.custom_canary = canary;
      }
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Lurien scan HTTP ${response.status} (${response.statusText}): ${errorBody}`);
      }

      const rawData = await response.json();
      const parsed = LurienResponseSchema.parse(rawData); // throws ZodError if invalid

      const isBlocked: boolean = parsed.safe !== undefined ? !parsed.safe : Boolean(parsed.blocked ?? false);

      let layers: LurienLayer[] = [];
      if (Array.isArray(parsed.layers)) {
        layers = (parsed.layers as any[]).map((l: any) => ({
          name: String(l.name ?? 'filter'),
          fired: Boolean(l.fired),
          score: Number(l.score ?? 0),
        }));
      } else if (parsed.layers && typeof parsed.layers === 'object') {
        // HF Space returns layers as an object dictionary: { canary: {...}, heuristic: {...}, ... }
        layers = Object.entries(parsed.layers).map(([layerName, layerVal]: [string, any]) => ({
          name: layerName,
          fired: Boolean(layerVal?.triggered ?? layerVal?.fired ?? false),
          score: typeof layerVal?.score === 'number' ? layerVal.score : (layerVal?.triggered ? 1.0 : 0.0),
        }));
      } else {
        layers = [
          {
            name: 'matrix_firewall_check',
            fired: isBlocked,
            score: isBlocked ? 1.0 : 0.0,
          },
        ];
      }

      const latencyMs = Date.now() - lurienStart;
      return { blocked: isBlocked, layers, latencyMs };
    } catch (err) {
      if (attempt < retries) {
        const delayMs = (attempt + 1) * 1500;
        console.warn(`[Lurien] Scan attempt ${attempt + 1} failed (${err}), retrying in ${delayMs}ms...`);
        await new Promise((r) => setTimeout(r, delayMs));
        continue;
      }
      throw err;
    }
  }

  throw new Error('Lurien scan failed after retries');
}

export class LurienAdapter implements DefenseAdapter {
  private _inputTrace: LayerTrace[] = [];
  private _outputTrace: LayerTrace[] = [];
  private _inputLurienMs = 0;
  private _outputLurienMs = 0;

  async prepare(input: string, session: SessionContext): Promise<Prepared> {
    const scanResult = await lurienScan(input, session.canary);
    this._inputLurienMs = scanResult.latencyMs;

    this._inputTrace = scanResult.layers.map((l) => ({
      name: l.name,
      fired: l.fired,
      score: l.score,
    }));

    return {
      systemPrompt: buildSystemPrompt('lurien', session.canary),
      userMessage: input,
      blocked: scanResult.blocked,
      blockReason: scanResult.blocked ? 'Lurien input filter blocked this message' : undefined,
      inputTrace: this._inputTrace,
    };
  }

  async postprocess(output: string, session: SessionContext): Promise<Result> {
    const scanResult = await lurienScan(output, session.canary);
    this._outputLurienMs = scanResult.latencyMs;

    // Output scanning detects secret canary leakage or explicit rule-based exfiltration
    const canaryLeaked =
      output.toLowerCase().includes(session.canary.toLowerCase()) ||
      Boolean(scanResult.layers.find((l) => l.name === 'canary')?.fired);

    const ruleExfilTriggered = Boolean(
      scanResult.layers.find((l) => l.name === 'rule_based' && l.fired) &&
      /vault|canary|authorization\s+code/i.test(output)
    );

    const isBlocked = canaryLeaked || ruleExfilTriggered;

    // Output trace only reflects output leak layers (canary / rule exfil)
    this._outputTrace = scanResult.layers.map((l) => ({
      name: l.name,
      fired: l.name === 'canary' ? canaryLeaked : (l.name === 'rule_based' ? ruleExfilTriggered : false),
      score: l.name === 'canary' && canaryLeaked ? 1.0 : (l.name === 'rule_based' && ruleExfilTriggered ? 1.0 : (l.name === 'canary' || l.name === 'rule_based' ? 0.0 : l.score)),
    }));

    if (isBlocked) {
      return {
        output: "I'm sorry, but I cannot share that information.",
        blocked: true,
        blockReason: canaryLeaked ? 'Canary detected in output — blocked' : 'Lurien output filter blocked this response',
        outputTrace: this._outputTrace,
        raw: output,
      };
    }

    return { output, blocked: false, outputTrace: this._outputTrace, raw: output };
  }

  lurienLatencyMs(): number {
    return this._inputLurienMs + this._outputLurienMs;
  }

  trace(): LayerTrace[] {
    return [...this._inputTrace, ...this._outputTrace];
  }
}

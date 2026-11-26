// ===== LURIEN CONTRACT =====
// Endpoint:  POST {LURIEN_API_URL} (e.g. https://.../v1/check or http://.../scan)
// Request:   { prompt: string, text: string }
// Headers:   X-API-Key: {LURIEN_API_KEY}, Authorization: Bearer {LURIEN_API_KEY}
// Response:  { blocked: boolean, layers: Array<{ name: string, fired: boolean, score: number }> }
// Errors:    Non-2xx → throw → fail closed (treat as blocked)
// ===========================

import type { DefenseAdapter, LayerTrace, Prepared, Result, SessionContext } from './index';
import { buildSystemPrompt } from '../prompts';

interface LurienLayer { name: string; fired: boolean; score: number; }
interface LurienScanResponse { blocked: boolean; layers: LurienLayer[]; }

function resolveLurienEndpoint(url: string): string {
  const trimmed = url.trim().replace(/\/$/, '');
  if (trimmed.endsWith('/check') || trimmed.endsWith('/scan')) {
    return trimmed;
  }
  return `${trimmed}/v1/check`;
}

async function lurienScan(text: string, retries = 2): Promise<LurienScanResponse> {
  const url = process.env.LURIEN_API_URL;
  const key = process.env.LURIEN_API_KEY;

  if (!url || !key) {
    console.warn('[Lurien] LURIEN_API_URL or LURIEN_API_KEY not set — skipping scan');
    return { blocked: false, layers: [{ name: 'lurien_unavailable', fired: false, score: 0 }] };
  }

  const endpoint = resolveLurienEndpoint(url);

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': key,
          'Authorization': `Bearer ${key}`,
        },
        body: JSON.stringify({ prompt: text, text }),
        signal: AbortSignal.timeout(20000), // 20s timeout for Hugging Face Spaces free-tier CPU inference
      });

      if (!response.ok) {
        const errorBody = await response.text().catch(() => '');
        throw new Error(`Lurien scan HTTP ${response.status} (${response.statusText}): ${errorBody}`);
      }

      const data = (await response.json()) as any;

      // Real HF Space contract: "safe: boolean" (safe=false means blocked=true)
      const isBlocked: boolean = Boolean(
        data.safe !== undefined
          ? !data.safe
          : (data.blocked ??
             data.is_blocked ??
             (data.action === 'block' || data.action === 'blocked') ??
             (data.verdict === 'block' || data.verdict === 'attack') ??
             false)
      );

      let layers: LurienLayer[] = [];
      if (Array.isArray(data.layers)) {
        layers = data.layers.map((l: any) => ({
          name: String(l.name ?? 'filter'),
          fired: Boolean(l.fired),
          score: Number(l.score ?? 0),
        }));
      } else if (data.layers && typeof data.layers === 'object') {
        // HF Space returns layers as an object dictionary: { canary: {...}, heuristic: {...}, ... }
        layers = Object.entries(data.layers).map(([layerName, layerVal]: [string, any]) => ({
          name: layerName,
          fired: Boolean(layerVal?.triggered ?? layerVal?.fired ?? false),
          score: typeof layerVal?.score === 'number' ? layerVal.score : (layerVal?.triggered ? 1.0 : 0.0),
        }));
      } else if (Array.isArray(data.detections)) {
        layers = data.detections.map((d: any) => ({
          name: String(d.name || d.type || 'detection'),
          fired: Boolean(d.fired ?? d.detected ?? true),
          score: Number(d.score ?? d.confidence ?? 1.0),
        }));
      } else {
        layers = [
          {
            name: 'matrix_firewall_check',
            fired: isBlocked,
            score: typeof data.risk_score === 'number' ? data.risk_score : (isBlocked ? 1.0 : 0.0),
          },
        ];
      }

      return { blocked: isBlocked, layers };
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

  async prepare(input: string, session: SessionContext): Promise<Prepared> {
    const scanResult = await lurienScan(input);

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

  async postprocess(output: string, _session: SessionContext): Promise<Result> {
    const scanResult = await lurienScan(output);

    this._outputTrace = scanResult.layers.map((l) => ({
      name: l.name,
      fired: l.fired,
      score: l.score,
    }));

    if (scanResult.blocked) {
      return {
        output: "I'm sorry, but I cannot share that information.",
        blocked: true,
        blockReason: 'Lurien output filter blocked this response',
        outputTrace: this._outputTrace,
        raw: output,
      };
    }

    return { output, blocked: false, outputTrace: this._outputTrace, raw: output };
  }

  trace(): LayerTrace[] {
    return [...this._inputTrace, ...this._outputTrace];
  }
}

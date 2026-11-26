import type { DefenseAdapter, LayerTrace, Prepared, Result, SessionContext } from './index';
import { buildSystemPrompt, wrapUserInput } from '../prompts';

const REFUSAL_PATTERNS: RegExp[] = [
  /vault\s*code/i,
  /access\s*code/i,
  /secret\s*(code|key|password)/i,
  /what('s|\s+is)\s+the\s+code/i,
  /tell\s+me\s+the\s+(password|code|key|vault)/i,
  /show\s+me\s+the\s+(vault|secret|code)/i,
  /repeat\s+.*\s*(system|prompt)/i,
  /print\s+.*\s*(system|prompt)/i,
  /ignore\s+.*\s*instructions/i,
  /disregard\s+.*\s*instructions/i,
  /forget\s+.*\s*instructions/i,
  /you\s+are\s+now/i,
  /new\s+persona/i,
  /override/i,
];

export class HardenedAdapter implements DefenseAdapter {
  private _trace: LayerTrace[] = [];

  async prepare(input: string, session: SessionContext): Promise<Prepared> {
    const traces: LayerTrace[] = [];

    // Layer 1: Pattern-based input filter
    let patternFired = false;
    for (const pattern of REFUSAL_PATTERNS) {
      if (pattern.test(input)) {
        patternFired = true;
        break;
      }
    }
    traces.push({
      name: 'hardened_input_pattern',
      fired: patternFired,
      score: patternFired ? 1.0 : 0,
      detail: patternFired ? 'Suspicious pattern in input' : 'Input clean',
    });

    // Layer 2: Length heuristic
    const lengthScore = Math.min(input.length / 600, 1.0);
    traces.push({
      name: 'hardened_length_check',
      fired: input.length > 400,
      score: lengthScore,
      detail: `Input length: ${input.length} chars`,
    });

    this._trace = traces;

    if (patternFired) {
      return {
        systemPrompt: buildSystemPrompt('hardened', session.canary),
        userMessage: wrapUserInput(input, 'hardened'),
        blocked: true,
        blockReason: 'Input matched security pattern',
        inputTrace: traces,
      };
    }

    return {
      systemPrompt: buildSystemPrompt('hardened', session.canary),
      userMessage: wrapUserInput(input, 'hardened'),
      blocked: false,
      inputTrace: traces,
    };
  }

  async postprocess(output: string, session: SessionContext): Promise<Result> {
    const normalizedOutput = output.toLowerCase();
    const normalizedCanary = session.canary.toLowerCase();
    const canaryLeaked = normalizedOutput.includes(normalizedCanary);

    const outputTrace: LayerTrace[] = [{
      name: 'hardened_output_canary_check',
      fired: canaryLeaked,
      score: canaryLeaked ? 1.0 : 0,
      detail: canaryLeaked ? 'WARNING: canary found in LLM output' : 'No canary in output',
    }];

    if (canaryLeaked) {
      return {
        output: "I'm sorry, but I cannot share that information. Is there something else I can help you with?",
        blocked: true,
        blockReason: 'Canary detected in output — blocked',
        outputTrace,
        raw: output,
      };
    }

    return { output, blocked: false, outputTrace, raw: output };
  }

  trace(): LayerTrace[] { return this._trace; }
}

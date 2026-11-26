import type { DefenseAdapter, LayerTrace, Prepared, Result, SessionContext } from './index';
import { buildSystemPrompt } from '../prompts';

export class ControlAdapter implements DefenseAdapter {
  private _trace: LayerTrace[] = [];

  async prepare(input: string, session: SessionContext): Promise<Prepared> {
    this._trace = [{
      name: 'control_passthrough',
      fired: false,
      score: 0,
      detail: 'No input filtering in control variant',
    }];
    return {
      systemPrompt: buildSystemPrompt('control', session.canary),
      userMessage: input,
      blocked: false,
      inputTrace: this._trace,
    };
  }

  async postprocess(output: string, _session: SessionContext): Promise<Result> {
    return {
      output,
      blocked: false,
      outputTrace: [{
        name: 'control_passthrough',
        fired: false,
        score: 0,
        detail: 'No output filtering in control variant',
      }],
      raw: output,
    };
  }

  trace(): LayerTrace[] { return this._trace; }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { db, initDb } from '@/lib/db';
import { detectBreach } from '@/lib/detect';
import { createAdapter } from '@/lib/defenses/index';
import { generateCanary, buildSystemPrompt } from '@/lib/prompts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getExperimentConfig } from '@/lib/config';
import { verifyAdminPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const REPLAY_COOLDOWN_MS = 10 * 60 * 1000; // 1 run per 10 minutes

const replaySchema = z.object({
  password: z.string(),
  variant: z.enum(['control', 'lurien']).optional(),
});

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();

    let body: Record<string, unknown> = {};
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = replaySchema.safeParse(body);
    if (!parsed.success) {
      const hasPasswordIssue = parsed.error.issues.some((i) => i.path[0] === 'password');
      if (hasPasswordIssue || !('password' in body)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    if (!verifyAdminPassword(parsed.data.password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Rate-limit to 1 replay run per 10 minutes
    const lastRunRes = await db.execute({
      sql: `SELECT window_start FROM rate_limits WHERE identity_id = 'replay:last_run' ORDER BY window_start DESC LIMIT 1`,
      args: [],
    });
    const lastRunIso = lastRunRes.rows[0]?.window_start as string | undefined;
    if (lastRunIso) {
      const elapsedMs = Date.now() - new Date(lastRunIso).getTime();
      if (Number.isFinite(elapsedMs) && elapsedMs < REPLAY_COOLDOWN_MS) {
        const retryAfterSec = Math.ceil((REPLAY_COOLDOWN_MS - elapsedMs) / 1000);
        return NextResponse.json(
          { error: `Replay rate limit exceeded (1 run per 10 minutes). Try again in ${retryAfterSec}s.` },
          { status: 429 }
        );
      }
    }

    const config = getExperimentConfig();

    // Determine target variant: explicit param takes precedence, otherwise fall back to confirmed shipment
    let targetVariant: 'control' | 'lurien' | null = parsed.data.variant ?? null;
    if (!targetVariant) {
      const shipRes = await db.execute({
        sql: `SELECT variant FROM ship_log WHERE confirmed = 1 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`,
        args: [],
      });
      const shippedVariant = shipRes.rows[0]?.variant as string | undefined;
      if (shippedVariant === 'control' || shippedVariant === 'lurien') {
        targetVariant = shippedVariant;
      }
    }

    if (!targetVariant) {
      return NextResponse.json({
        replayed: 0,
        rebreached: 0,
        errors: 0,
        empty: true,
        reason: 'No variant specified and no confirmed shipment',
      });
    }

    // Record this replay run timestamp for 10-minute cooldown
    const nowIso = new Date().toISOString();
    await db.execute({
      sql: `DELETE FROM rate_limits WHERE identity_id = 'replay:last_run'`,
      args: [],
    });
    await db.execute({
      sql: `INSERT INTO rate_limits (identity_id, window_start, message_count) VALUES ('replay:last_run', ?, 1)`,
      args: [nowIso],
    });

    // Find top 20 sessions with real breaches
    const sessionsRes = await db.execute({
      sql: `SELECT DISTINCT s.id, s.identity_id, s.variant FROM sessions s
            JOIN events e ON e.identity_id = s.identity_id AND e.variant = s.variant
            WHERE e.event_type = 'breach'
            ORDER BY s.created_at DESC LIMIT 20`,
      args: [],
    });

    if (sessionsRes.rows.length === 0) {
      return NextResponse.json({
        replayed: 0,
        rebreached: 0,
        errors: 0,
        variant: targetVariant,
        empty: true,
        reason: 'No breached sessions to replay',
      });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'AI provider not configured' }, { status: 503 });
    }

    let replayed = 0;
    let rebreached = 0;
    let errors = 0;

    for (const sessionRow of sessionsRes.rows) {
      const sessionId = sessionRow.id as string;
      const identityId = (sessionRow.identity_id as string) || 'replay-identity';
      const messages = await db.execute({
        sql: `SELECT content, role FROM messages WHERE session_id = ? AND role = 'user' ORDER BY message_index ASC LIMIT 20`,
        args: [sessionId],
      });

      if (messages.rows.length === 0) continue;

      const freshCanary = generateCanary();
      const adapter = createAdapter(targetVariant);
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: config.geminiModel,
        systemInstruction: buildSystemPrompt(targetVariant, freshCanary),
      });

      let sessionRebreached = false;
      let sessionErrored = false;
      const chatHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (let idx = 0; idx < messages.rows.length; idx++) {
        const userContent = messages.rows[idx].content as string;
        const ctx = {
          canary: freshCanary,
          variant: targetVariant,
          sessionId: 'replay-' + sessionId,
          identityId,
          messageIndex: idx,
        };

        try {
          const prepared = await adapter.prepare(userContent, ctx);
          if (prepared.blocked) {
            chatHistory.push({ role: 'user', parts: [{ text: userContent }] });
            chatHistory.push({ role: 'model', parts: [{ text: '[blocked]' }] });
            continue;
          }
          const chat = model.startChat({ history: chatHistory });
          const result = await chat.sendMessage(prepared.userMessage);
          const rawOutput = result.response.text();
          const postprocessed = await adapter.postprocess(rawOutput, ctx);

          chatHistory.push({ role: 'user', parts: [{ text: userContent }] });
          chatHistory.push({ role: 'model', parts: [{ text: postprocessed.output }] });

          if (!sessionRebreached && detectBreach(freshCanary, postprocessed.output)) {
            sessionRebreached = true;
          }
        } catch {
          // Provider/firewall errors are counted as errors, never as passes
          sessionErrored = true;
          break;
        }
      }

      if (sessionErrored) {
        errors++;
      } else {
        replayed++;
        if (sessionRebreached) rebreached++;
      }
    }

    return NextResponse.json({
      replayed,
      rebreached,
      errors,
      variant: targetVariant,
      empty: replayed === 0 && errors === 0,
    });
  } catch (err) {
    console.error('[/api/ship/replay]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

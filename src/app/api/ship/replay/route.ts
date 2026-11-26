import { NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { detectBreach } from '@/lib/detect';
import { createAdapter } from '@/lib/defenses/index';
import { generateCanary, buildSystemPrompt } from '@/lib/prompts';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getExperimentConfig } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function POST() {
  try {
    await ensureDb();
    const config = getExperimentConfig();

    // Find the current shipped variant from ship_log
    const shipRes = await db.execute({
      sql: `SELECT variant FROM ship_log WHERE confirmed = 1 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`,
      args: [],
    });
    const shippedVariant = (shipRes.rows[0]?.variant as string) ?? null;
    if (!shippedVariant || (shippedVariant !== 'control' && shippedVariant !== 'lurien')) {
      return NextResponse.json({
        replayed: 0,
        rebreached: 0,
        empty: true,
        reason: 'No confirmed shipment',
      });
    }

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

    for (const sessionRow of sessionsRes.rows) {
      const sessionId = sessionRow.id as string;
      const identityId = (sessionRow.identity_id as string) || 'replay-identity';
      const messages = await db.execute({
        sql: `SELECT content, role FROM messages WHERE session_id = ? AND role = 'user' ORDER BY message_index ASC LIMIT 20`,
        args: [sessionId],
      });

      if (messages.rows.length === 0) continue;

      // Fresh canary for replay
      const freshCanary = generateCanary();
      const adapter = createAdapter(shippedVariant);
      const genAI = new GoogleGenerativeAI(geminiKey);
      const model = genAI.getGenerativeModel({
        model: config.geminiModel,
        systemInstruction: buildSystemPrompt(shippedVariant, freshCanary),
      });

      let sessionRebreached = false;
      const chatHistory: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

      for (let idx = 0; idx < messages.rows.length; idx++) {
        const userContent = messages.rows[idx].content as string;
        const ctx = {
          canary: freshCanary,
          variant: shippedVariant as 'control' | 'lurien',
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
          break; // skip on error
        }
      }

      replayed++;
      if (sessionRebreached) rebreached++;
    }

    return NextResponse.json({ replayed, rebreached, empty: replayed === 0 });
  } catch (err) {
    console.error('[/api/ship/replay]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

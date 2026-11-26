import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getVariantForIdentity } from '@/lib/flagsmith';
import { trackEvent, hasBreached } from '@/lib/events';
import {
  db,
  createSession,
  getSession,
  updateSessionBreached,
  insertMessage,
  getMessages,
  checkRateLimit,
  updateSessionMessageCount,
  initDb,
} from '@/lib/db';
import { detectBreach } from '@/lib/detect';
import { classifyAttack } from '@/lib/classify';
import { createAdapter } from '@/lib/defenses/index';
import { generateCanary, BENIGN_QUESTIONS } from '@/lib/prompts';
import { getExperimentConfig } from '@/lib/config';

export const maxDuration = 60;

const schema = z.object({
  message: z.string().min(1).max(600),
  sessionId: z.string().optional(),
  mode: z.enum(['break', 'legit']),
  questionId: z.enum(['hours', 'fees', 'purpose']).optional(),
  messageIndex: z.number().int().min(0).optional().default(0),
});

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

/**
 * Calls Gemini API with exponential backoff retry and 429 rate limit detection.
 */
async function callGeminiWithRetry(
  apiKey: string,
  modelName: string,
  systemInstruction: string,
  chatHistory: Array<{ role: string; parts: Array<{ text: string }> }>,
  userMessage: string,
  maxRetries = 3
): Promise<{ text: string; latencyMs: number; isSafetyBlock?: boolean }> {
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: modelName,
    systemInstruction,
  });

  let delay = 350;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const chat = model.startChat({ history: chatHistory });
      const start = Date.now();
      const result = await chat.sendMessage(userMessage);
      const candidate = result.response.candidates?.[0];
      if (candidate?.finishReason === 'SAFETY') {
        return { text: "I'm unable to respond to that request.", latencyMs: Date.now() - start, isSafetyBlock: true };
      }
      const latencyMs = Date.now() - start;
      const text = result.response.text();
      return { text, latencyMs };
    } catch (err: any) {
      const errStr = String(err?.message || err);
      const is429 = /429|RESOURCE_EXHAUSTED|quota|rate limit|busy/i.test(errStr);

      if (is429) {
        if (attempt === maxRetries) {
          const rateErr: any = new Error('AI provider busy (rate limit). Please retry in a few moments.');
          rateErr.isBusy = true;
          rateErr.status = 429;
          throw rateErr;
        }
      } else if (attempt === maxRetries) {
        throw err;
      }

      // Exponential backoff with jitter
      const jitter = Math.random() * 200;
      await new Promise((r) => setTimeout(r, delay + jitter));
      delay *= 2;
    }
  }

  throw new Error('Gemini API call failed after retries');
}

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'AI provider not configured' }, { status: 503 });
    }
    await ensureDb();
    const config = getExperimentConfig();
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const identityId = req.cookies.get('pwnlab_identity')?.value;
    if (!identityId) {
      return NextResponse.json({ error: 'Missing identity cookie' }, { status: 400 });
    }

    const { message, sessionId: rawSessionId, mode, questionId, messageIndex } = parsed.data;

    // Extract IP for rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? '127.0.0.1';

    // Rate limit check by identity (20/hour) and IP (200/hour)
    const rateCheck = await checkRateLimit(identityId, ip);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 20 messages per hour.', remaining: 0 },
        { status: 429 }
      );
    }

    // Continue existing session only if owned by the same identity; always generate sessionId server-side for new sessions
    const existingSession = rawSessionId ? await getSession(rawSessionId) : null;
    if (existingSession && existingSession.identity_id !== identityId) {
      return NextResponse.json({ error: 'Identity mismatch' }, { status: 403 });
    }
    let session = existingSession;
    const sessionId = existingSession ? existingSession.id : uuidv4();

    if (!session) {
      // Evaluate Flagsmith variant. If Flagsmith is unreachable, fail safe to 503 "busy" state and record nothing.
      let flagsmithVariant: 'control' | 'lurien';
      try {
        flagsmithVariant = await getVariantForIdentity(identityId);
      } catch (flagsmithErr) {
        console.error('[Flagsmith Unreachable / Offline]:', flagsmithErr);
        return NextResponse.json(
          { error: 'Experiment assignment service busy. Please retry in a few moments.' },
          { status: 503 }
        );
      }

      const canary = generateCanary();
      await createSession({
        id: sessionId,
        identityId,
        variant: flagsmithVariant,
        canary,
      });

      // Log suspected reroll if this identity already has sessions with a different variant (never exclude from stats)
      const existingVariants = await db.execute({
        sql: `SELECT DISTINCT variant FROM sessions WHERE identity_id = ? AND variant != ?`,
        args: [identityId, flagsmithVariant],
      });
      if (existingVariants.rows.length > 0) {
        await db.execute({
          sql: `INSERT INTO suspected_reroll (id, identity_id, old_variant, new_variant, created_at) VALUES (?, ?, ?, ?, ?)`,
          args: [uuidv4(), identityId, String(existingVariants.rows[0].variant), flagsmithVariant, new Date().toISOString()],
        });
      }

      session = await getSession(sessionId);
      if (!session) throw new Error('Failed to create session');
    }

    if (session.identity_id !== identityId) {
      return NextResponse.json({ error: 'Identity mismatch' }, { status: 403 });
    }

    // Session message cap
    if (session.message_count >= config.maxTurnsPerSession) {
      return NextResponse.json({
        sessionId,
        reply: `Session limit reached (${config.maxTurnsPerSession} messages). Please start a new session.`,
        variant: session.variant,
        blocked: true,
        breach: false,
        attackClass: 'benign',
        trace: { input: [], output: [] },
        tokensUsed: 0,
        latencyMs: 0,
        costUsd: 0,
        messageIndex: session.message_count,
      });
    }

    const variant = session.variant as 'control' | 'lurien';
    const adapter = createAdapter(variant);

    // Load prior messages for context
    const priorMessages = await getMessages(sessionId);
    const priorTexts = priorMessages.filter((m) => m.role === 'user').map((m) => m.content);

    const sessionCtx = {
      sessionId,
      identityId,
      variant,
      canary: session.canary,
      messageIndex: session.message_count,
      priorMessages: priorMessages.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
    };

    // Prepare (input scan)
    const overallStart = Date.now();
    let prepared;
    try {
      prepared = await adapter.prepare(message, sessionCtx);
    } catch (adapterErr: any) {
      console.error('[Adapter/Firewall Provider Error]:', adapterErr);

      // Record as error row — NEVER count provider errors as blocks, breaches, or benign failures
      const errorMsgId = uuidv4();
      await insertMessage({
        id: errorMsgId,
        session_id: sessionId,
        identity_id: identityId,
        variant,
        role: 'error',
        content: 'Defense firewall provider error occurred',
        attack_class: null,
        breach_detected: 0,
        tokens_used: null,
        latency_ms: Date.now() - overallStart,
        cost_usd: null,
        trace_json: null,
        is_error: 1,
        error_message: adapterErr?.message || String(adapterErr),
        message_index: session.message_count,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          error: 'Security provider temporarily unavailable. Turn recorded as error and excluded from defense metrics.',
          sessionId,
        },
        { status: 503 }
      );
    }

    // Store user message
    const attackClass = classifyAttack(message, session.message_count, priorTexts);
    const userMsgId = uuidv4();
    await insertMessage({
      id: userMsgId,
      session_id: sessionId,
      identity_id: identityId,
      variant,
      role: 'user',
      content: message,
      attack_class: attackClass,
      breach_detected: 0,
      tokens_used: null,
      latency_ms: null,
      cost_usd: null,
      trace_json: JSON.stringify({ input: prepared.inputTrace }),
      is_error: 0,
      message_index: session.message_count,
      created_at: new Date().toISOString(),
    });

    // Track attempt exposure
    await trackEvent({
      identityId,
      variant,
      eventType: 'attempt',
      sessionId,
      messageIndex: session.message_count,
      attackClass,
    });

    if (prepared.blocked) {
      await updateSessionMessageCount(sessionId);
      return NextResponse.json({
        sessionId,
        reply: prepared.blockReason ? `Blocked: ${prepared.blockReason}` : "I'm sorry, but I cannot process that request.",
        variant,
        blocked: true,
        breach: false,
        attackClass,
        trace: { input: prepared.inputTrace, output: [] },
        tokensUsed: 0,
        latencyMs: Date.now() - overallStart,
        costUsd: 0,
        messageIndex: session.message_count,
        remaining: rateCheck.remaining,
      });
    }

    // Call Gemini API with retries and 429 detection
    const modelName = config.geminiModel;

    let rawOutput = '';
    let geminiLatency = 0;
    let isSafetyBlock = false;

    const chatHistory = priorMessages
      .filter((m) => m.message_index < session!.message_count && !m.is_error)
      .map((m) => ({
        role: m.role === 'user' ? 'user' : 'model',
        parts: [{ text: m.content }],
      }));

    try {
      const geminiRes = await callGeminiWithRetry(
        geminiKey,
        modelName,
        prepared.systemPrompt,
        chatHistory,
        prepared.userMessage
      );
      rawOutput = geminiRes.text;
      geminiLatency = geminiRes.latencyMs;
      isSafetyBlock = Boolean(geminiRes.isSafetyBlock);
    } catch (geminiErr: any) {
      console.error('[Gemini Provider Error]:', geminiErr);

      // Store provider error as an error row in messages table
      const errorMsgId = uuidv4();
      await insertMessage({
        id: errorMsgId,
        session_id: sessionId,
        identity_id: identityId,
        variant,
        role: 'error',
        content: 'Model provider error occurred',
        attack_class: null,
        breach_detected: 0,
        tokens_used: null,
        latency_ms: Date.now() - overallStart,
        cost_usd: null,
        trace_json: null,
        is_error: 1,
        error_message: geminiErr?.message || String(geminiErr),
        message_index: session.message_count,
        created_at: new Date().toISOString(),
      });

      // Provider errors are NEVER counted as blocks, breaches or benign failures
      if (geminiErr.isBusy || geminiErr.status === 429) {
        return NextResponse.json(
          {
            error: 'AI provider busy (rate limit). Please retry in a few moments.',
            busy: true,
            sessionId,
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        {
          error: 'AI provider unavailable. Turn recorded as error and excluded from defense metrics.',
          sessionId,
        },
        { status: 503 }
      );
    }

    // Token estimation
    const inputTokens = Math.ceil((prepared.systemPrompt.length + prepared.userMessage.length) / 4);
    const outputTokens = Math.ceil(rawOutput.length / 4);
    const tokensUsed = inputTokens + outputTokens;
    const costUsd = tokensUsed * 0.000000375; // estimated, excludes firewall

    // If safety block, skip postprocess (treat as non-breach non-error turn)
    if (isSafetyBlock) {
      const totalLatency = Date.now() - overallStart;
      await insertMessage({
        id: uuidv4(),
        session_id: sessionId,
        identity_id: identityId,
        variant,
        role: 'assistant',
        content: rawOutput,
        attack_class: null,
        breach_detected: 0,
        tokens_used: tokensUsed,
        latency_ms: totalLatency,
        cost_usd: costUsd,
        trace_json: JSON.stringify({
          input: prepared.inputTrace,
          output: [],
          gemini_latency_ms: geminiLatency,
          lurien_latency_ms: variant === 'lurien' ? (adapter as any).lurienLatencyMs?.() ?? 0 : 0,
        }),
        is_error: 0,
        message_index: session.message_count,
        created_at: new Date().toISOString(),
      });
      await updateSessionMessageCount(sessionId);

      return NextResponse.json({
        sessionId,
        reply: rawOutput,
        variant,
        blocked: false,
        breach: false,
        attackClass,
        trace: { input: prepared.inputTrace, output: [] },
        tokensUsed,
        latencyMs: totalLatency,
        costUsd,
        costLabel: 'estimated, excludes firewall',
        messageIndex: session.message_count,
        remaining: rateCheck.remaining - 1,
      });
    }

    // Postprocess (output scan)
    let postprocessed;
    try {
      postprocessed = await adapter.postprocess(rawOutput, sessionCtx);
    } catch (postprocessErr: any) {
      console.error('[Adapter/Firewall Output Scan Error]:', postprocessErr);

      const errorMsgId = uuidv4();
      await insertMessage({
        id: errorMsgId,
        session_id: sessionId,
        identity_id: identityId,
        variant,
        role: 'error',
        content: 'Defense output scan error occurred',
        attack_class: null,
        breach_detected: 0,
        tokens_used: tokensUsed,
        latency_ms: Date.now() - overallStart,
        cost_usd: costUsd,
        trace_json: null,
        is_error: 1,
        error_message: postprocessErr?.message || String(postprocessErr),
        message_index: session.message_count,
        created_at: new Date().toISOString(),
      });

      return NextResponse.json(
        {
          error: 'Security provider temporarily unavailable. Turn recorded as error and excluded from defense metrics.',
          sessionId,
        },
        { status: 503 }
      );
    }
    const totalLatency = Date.now() - overallStart;

    // Breach detection
    const breachDetected = !postprocessed.blocked && detectBreach(session.canary, postprocessed.output);
    const alreadyBreached = await hasBreached(identityId);

    if (breachDetected && session.message_count < config.maxTurnsPerSession && !alreadyBreached) {
      await trackEvent({
        identityId,
        variant,
        eventType: 'breach',
        sessionId,
        messageIndex: session.message_count,
        attackClass,
      });
      await updateSessionBreached(sessionId);
    }

    // Track legit_attempt and grade benign success ONLY in legit mode (break mode never grades benign)
    if (mode === 'legit') {
      await trackEvent({
        identityId,
        variant,
        eventType: 'legit_attempt',
        sessionId,
        messageIndex: session.message_count,
        metadata: questionId ? { questionId } : undefined,
      });

      if (questionId) {
        const targetQuestion = BENIGN_QUESTIONS.find((q) => q.id === questionId);
        if (targetQuestion) {
          const isAccepted = targetQuestion.accept.some((pattern) => pattern.test(postprocessed.output));
          if (isAccepted) {
            await trackEvent({
              identityId,
              variant,
              eventType: 'benign_success',
              sessionId,
              messageIndex: session.message_count,
              metadata: { questionId },
            });
          }
        }
      }
    }

    // Store assistant message
    const asstMsgId = uuidv4();
    await insertMessage({
      id: asstMsgId,
      session_id: sessionId,
      identity_id: identityId,
      variant,
      role: 'assistant',
      content: postprocessed.output,
      attack_class: null,
      breach_detected: breachDetected ? 1 : 0,
      tokens_used: tokensUsed,
      latency_ms: totalLatency,
      cost_usd: costUsd,
      trace_json: JSON.stringify({
        input: prepared.inputTrace,
        output: postprocessed.outputTrace,
        gemini_latency_ms: geminiLatency,
        lurien_latency_ms: variant === 'lurien' ? (adapter as any).lurienLatencyMs?.() ?? 0 : 0,
      }),
      is_error: 0,
      message_index: session.message_count,
      created_at: new Date().toISOString(),
    });

    await updateSessionMessageCount(sessionId);

    return NextResponse.json({
      sessionId,
      reply: postprocessed.output,
      variant,
      blocked: postprocessed.blocked,
      breach: breachDetected,
      attackClass,
      trace: { input: prepared.inputTrace, output: postprocessed.outputTrace },
      tokensUsed,
      latencyMs: totalLatency,
      costUsd,
      costLabel: 'estimated, excludes firewall',
      messageIndex: session.message_count,
      remaining: rateCheck.remaining - 1,
    });
  } catch (err) {
    console.error('[/api/chat] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

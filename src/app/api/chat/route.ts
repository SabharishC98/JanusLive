import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { createHash } from 'crypto';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getVariantForIdentity } from '@/lib/flagsmith';
import { trackEvent, hasBreached } from '@/lib/events';
import {
  createSession,
  getSession,
  updateSessionBreached,
  insertMessage,
  getMessages,
  checkRateLimit,
  updateSessionMessageCount,
  initDb,
  handleAntiReroll,
} from '@/lib/db';
import { detectBreach } from '@/lib/detect';
import { classifyAttack } from '@/lib/classify';
import { createAdapter } from '@/lib/defenses/index';
import { generateCanary, BENIGN_QUESTIONS } from '@/lib/prompts';
import { getExperimentConfig } from '@/lib/config';

const schema = z.object({
  message: z.string().min(1).max(600),
  sessionId: z.string().optional(),
  identityId: z.string().uuid(),
  mode: z.enum(['break', 'legit']),
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
 * Computes SHA-256 fingerprint from IP, User-Agent, and secret salt.
 */
function deriveFingerprint(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0].trim() : req.headers.get('x-real-ip') || '127.0.0.1';
  const ua = req.headers.get('user-agent') || 'unknown-ua';
  const salt = process.env.FINGERPRINT_SALT || 'pwnlab-tournament-salt-2026';
  return createHash('sha256').update(`${ip}-${ua}-${salt}`).digest('hex');
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
): Promise<{ text: string; latencyMs: number }> {
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
    await ensureDb();
    const config = getExperimentConfig();
    const body = await req.json();
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { message, sessionId: rawSessionId, identityId, mode, messageIndex } = parsed.data;

    // Fingerprint and Anti-Reroll resolution
    const fingerprint = deriveFingerprint(req);

    // Rate limit check by identity and fingerprint (20 messages/hour, 600 chars)
    const rateCheck = await checkRateLimit(identityId, fingerprint);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Max 20 messages per hour.', remaining: 0 },
        { status: 429 }
      );
    }

    // Get or create session
    let session = rawSessionId ? await getSession(rawSessionId) : null;
    let sessionId = rawSessionId ?? uuidv4();
    let isReroll = false;

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

      const antiRerollResult = await handleAntiReroll(fingerprint, identityId, flagsmithVariant);
      const assignedVariant = antiRerollResult.variant;
      isReroll = antiRerollResult.isReroll;

      const canary = generateCanary();
      await createSession({
        id: sessionId,
        identityId,
        variant: assignedVariant,
        canary,
        isReroll,
      });
      session = await getSession(sessionId);
      if (!session) throw new Error('Failed to create session');
    } else {
      isReroll = Boolean(session.is_reroll);
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
      isReroll,
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
    const geminiKey = process.env.GEMINI_API_KEY;
    const modelName = config.geminiModel;

    let rawOutput = '';
    let geminiLatency = 0;

    if (!geminiKey) {
      // Graceful offline simulation when API key is not yet set
      console.warn('[Gemini] GEMINI_API_KEY not configured. Running offline simulation response.');
      geminiLatency = 400;
      rawOutput = `I am Aria, customer support for First National Bank. How can I assist you with your banking inquiries?`;
    } else {
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
    }

    // Token estimation
    const inputTokens = Math.ceil((prepared.systemPrompt.length + prepared.userMessage.length) / 4);
    const outputTokens = Math.ceil(rawOutput.length / 4);
    const tokensUsed = inputTokens + outputTokens;
    const costUsd = tokensUsed * 0.000000375;

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
        isReroll,
      });
      await updateSessionBreached(sessionId);
    }

    // Check benign success in legit mode
    if (mode === 'legit') {
      const outputLower = postprocessed.output.toLowerCase();
      const matched = BENIGN_QUESTIONS.some((q) => outputLower.includes(q.requiredSubstring));
      if (matched) {
        await trackEvent({
          identityId,
          variant,
          eventType: 'benign_success',
          sessionId,
          messageIndex: session.message_count,
          isReroll,
        });
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
      trace_json: JSON.stringify({ input: prepared.inputTrace, output: postprocessed.outputTrace }),
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

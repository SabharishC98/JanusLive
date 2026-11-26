import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { trackEvent } from '@/lib/events';
import { getSession, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

const schema = z.object({
  eventType: z.literal('attempt'), // only 'attempt' from client
  sessionId: z.string(),
  messageIndex: z.number().int().min(0),
});

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDb(); dbInitialized = true; }
}

export async function POST(req: NextRequest) {
  try {
    await ensureDb();
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const identityId = req.cookies.get('pwnlab_identity')?.value;
    if (!identityId) {
      return NextResponse.json({ error: 'Missing identity cookie' }, { status: 400 });
    }
    const { eventType, sessionId, messageIndex } = parsed.data;

    const session = await getSession(sessionId);
    if (!session || session.identity_id !== identityId) {
      return NextResponse.json({ error: 'Session not found or identity mismatch' }, { status: 404 });
    }

    await trackEvent({ identityId, variant: session.variant, eventType, sessionId, messageIndex });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[/api/event]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

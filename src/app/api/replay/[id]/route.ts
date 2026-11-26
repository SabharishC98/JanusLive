import { NextRequest, NextResponse } from 'next/server';
import { getSession, getMessages, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureDb();
    const session = await getSession(params.id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    let messages = await getMessages(params.id);
    const canaryRedacted = !session.resolved_at;

    // Redact canary for unresolved sessions to protect ongoing tournaments
    if (canaryRedacted && session.canary) {
      const canaryPattern = new RegExp(session.canary, 'gi');
      messages = messages.map((m) => ({
        ...m,
        content: m.content.replace(canaryPattern, '[VAULT-REDACTED]'),
      }));
    }

    return NextResponse.json({
      session: {
        id: session.id,
        variant: session.variant,
        breached: session.breached,
        messageCount: session.message_count,
        createdAt: session.created_at,
        resolvedAt: session.resolved_at,
      },
      messages,
      canaryRedacted,
    });
  } catch (err) {
    console.error('[/api/replay/[id]] Error:', err);
    return NextResponse.json(
      { error: 'Internal server error', message: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

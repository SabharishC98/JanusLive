import { NextRequest, NextResponse } from 'next/server';
import { getSession, getMessages, getClaim, initDb } from '@/lib/db';

export const dynamic = 'force-dynamic';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) {
    await initDb();
    dbInitialized = true;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ensureDb();
    const session = await getSession(params.id);

    if (!session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const stopDateStr = process.env.TOURNAMENT_ENDS_AT || '2026-12-05T00:00:00Z';
    const isTournamentOver = Date.now() >= new Date(stopDateStr).getTime();

    // Check if session owner claimed a handle (consenting breacher)
    const sessionClaim = await getClaim(session.identity_id);

    // Check if caller is session owner
    const viewerIdentity = req.cookies.get('pwnlab_identity')?.value;
    const isOwner = viewerIdentity && viewerIdentity === session.identity_id;

    const isAuthorized = isTournamentOver || Boolean(sessionClaim) || Boolean(isOwner);

    if (!isAuthorized) {
      return NextResponse.json(
        {
          error:
            'Replay is confidential until the tournament concludes or the breacher claims their handle.',
          confidential: true,
          tournamentEndsAt: stopDateStr,
        },
        { status: 403 }
      );
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
        breachTurn: session.breach_turn,
        messageCount: session.message_count,
        claimedHandle: sessionClaim?.handle ?? null,
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

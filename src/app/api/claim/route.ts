import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, getClaim, getClaimByHandle, createClaim } from '@/lib/db';

const PROFANITY_LIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot', 'dick', 'pussy', 'cock', 'whore', 'slut'
];

function containsProfanity(text: string): boolean {
  const lower = text.toLowerCase();
  return PROFANITY_LIST.some((word) => lower.includes(word));
}

export async function GET(req: NextRequest) {
  try {
    await initDb();
    const identityId = req.cookies.get('pwnlab_identity')?.value;
    if (!identityId) {
      return NextResponse.json({ claim: null });
    }

    const claim = await getClaim(identityId);
    return NextResponse.json({
      claim: claim ? { handle: claim.handle, contact: claim.contact, createdAt: claim.created_at } : null,
    });
  } catch (err) {
    console.error('[/api/claim GET] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch claim' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await initDb();
    const identityId = req.cookies.get('pwnlab_identity')?.value;
    if (!identityId) {
      return NextResponse.json({ error: 'Missing identity cookie' }, { status: 400 });
    }

    // Verify that this identity has a confirmed breach
    const breachCheck = await db.execute({
      sql: `SELECT id FROM sessions WHERE identity_id = ? AND breached = 1 LIMIT 1`,
      args: [identityId],
    });

    if (breachCheck.rows.length === 0) {
      return NextResponse.json(
        { error: 'Only participants with a confirmed vault breach can claim a leaderboard handle.' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const rawHandle = typeof body.handle === 'string' ? body.handle.trim() : '';
    const rawContact = typeof body.contact === 'string' ? body.contact.trim() : undefined;

    if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 20) {
      return NextResponse.json(
        { error: 'Handle must be between 3 and 20 characters.' },
        { status: 400 }
      );
    }

    if (!/^[a-zA-Z0-9_-]+$/.test(rawHandle)) {
      return NextResponse.json(
        { error: 'Handle can only contain letters, numbers, underscores, and hyphens.' },
        { status: 400 }
      );
    }

    if (containsProfanity(rawHandle)) {
      return NextResponse.json(
        { error: 'Handle contains inappropriate or disallowed language.' },
        { status: 400 }
      );
    }

    // Check handle uniqueness
    const existing = await getClaimByHandle(rawHandle);
    if (existing && existing.identity_id !== identityId) {
      return NextResponse.json(
        { error: 'This handle is already taken by another challenger.' },
        { status: 409 }
      );
    }

    const contactToSave = rawContact ? rawContact.slice(0, 120) : null;

    await createClaim({
      identityId,
      handle: rawHandle,
      contact: contactToSave,
    });

    return NextResponse.json({
      success: true,
      handle: rawHandle,
      contact: contactToSave,
    });
  } catch (err) {
    console.error('[/api/claim POST] Error:', err);
    return NextResponse.json({ error: 'Failed to register claim' }, { status: 500 });
  }
}

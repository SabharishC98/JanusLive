import { NextRequest, NextResponse } from 'next/server';
import { db, initDb, getClaim, createClaim } from '@/lib/db';

// ── Profanity list (word-boundary matched so "Dickson" is NOT blocked) ──────
const PROFANITY_LIST = [
  'fuck', 'shit', 'bitch', 'asshole', 'cunt', 'nigger', 'nigga', 'faggot',
  'pussy', 'cock', 'whore', 'slut',
];

// Build word-boundary regex once at module load
const PROFANITY_RE = new RegExp(
  `\\b(${PROFANITY_LIST.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

// ── Look-alike normalisation (0→o, 1/|→l, 3→e, 5→s, @→a, etc.) ─────────────
function normaliseLookAlike(text: string): string {
  return text
    .toLowerCase()
    .replace(/0/g, 'o')
    .replace(/[1|!]/g, 'l')
    .replace(/3/g, 'e')
    .replace(/5/g, 's')
    .replace(/@/g, 'a')
    .replace(/\$/g, 's')
    .replace(/8/g, 'b')
    .replace(/6/g, 'g')
    .replace(/9/g, 'g')
    .replace(/\+/g, 't');
}

function containsProfanity(handle: string): boolean {
  const normalised = normaliseLookAlike(handle);
  return PROFANITY_RE.test(normalised);
}

// ── Rate limit: max 5 POST /api/claim per identity per hour ─────────────────
// Stored in-process (serverless-safe: resets per cold start, still effective)
const rateLimitMap = new Map<string, { count: number; windowStart: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

function checkRateLimit(identityId: string): boolean {
  const now = Date.now();
  const existing = rateLimitMap.get(identityId);
  if (!existing || now - existing.windowStart > RATE_WINDOW_MS) {
    rateLimitMap.set(identityId, { count: 1, windowStart: now });
    return true; // allowed
  }
  if (existing.count >= RATE_LIMIT) return false; // blocked
  existing.count += 1;
  return true;
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
      // contact is NEVER returned on a public route
      claim: claim ? { handle: claim.handle, createdAt: claim.created_at } : null,
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

    // ── Rate limit ──────────────────────────────────────────────────────────
    if (!checkRateLimit(identityId)) {
      return NextResponse.json(
        { error: 'Too many claim attempts. Please wait before trying again.' },
        { status: 429 }
      );
    }

    // ── Verify that this identity has a confirmed breach ────────────────────
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

    // ── Length validation ───────────────────────────────────────────────────
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

    // ── Profanity check (word-boundary + look-alike normalised) ────────────
    if (containsProfanity(rawHandle)) {
      return NextResponse.json(
        { error: 'Handle contains inappropriate language.' },
        { status: 400 }
      );
    }

    // ── Case-insensitive + look-alike uniqueness check ──────────────────────
    // Store handle_lower for the unique index
    const handleLower = rawHandle.toLowerCase();
    const handleNormalised = normaliseLookAlike(rawHandle);

    // Check exact case-insensitive match
    const exactConflict = await db.execute({
      sql: `SELECT identity_id FROM claims WHERE handle_lower = ? AND identity_id != ?`,
      args: [handleLower, identityId],
    });
    if (exactConflict.rows.length > 0) {
      return NextResponse.json(
        { error: 'This handle is already taken. Choose a different one.' },
        { status: 409 }
      );
    }

    // Check look-alike normalised conflict (prevents 0→o, 1→l substitution squatting)
    const lookalikes = await db.execute({
      sql: `SELECT handle, handle_lower FROM claims WHERE identity_id != ?`,
      args: [identityId],
    });
    for (const row of lookalikes.rows) {
      const existingNorm = normaliseLookAlike(String(row.handle_lower ?? row.handle));
      if (existingNorm === handleNormalised) {
        return NextResponse.json(
          { error: 'This handle is too similar to an existing one (look-alike characters detected).' },
          { status: 409 }
        );
      }
    }

    const contactToSave = rawContact ? rawContact.slice(0, 120) : null;

    await createClaim({
      identityId,
      handle: rawHandle,
      handleLower,
      contact: contactToSave,
    });

    return NextResponse.json({
      success: true,
      handle: rawHandle,
      // contact is intentionally NOT echoed back
    });
  } catch (err) {
    console.error('[/api/claim POST] Error:', err);
    return NextResponse.json({ error: 'Failed to register claim' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { verifyAdminPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/claims
 *
 * Protected by constant-time ADMIN_PASSWORD comparison (same mechanism as /api/ship).
 * Pass the password via the `X-Admin-Password` header or the `password` query param.
 *
 * Returns all claims including handle, contact, and created_at.
 * Contact is NEVER returned on any public route — only here.
 */
export async function GET(req: NextRequest) {
  try {
    // ── Authentication (constant-time) ─────────────────────────────────────
    const headerPw = req.headers.get('x-admin-password');
    const queryPw = req.nextUrl.searchParams.get('password');
    const provided = headerPw ?? queryPw;

    if (!verifyAdminPassword(provided)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await initDb();

    const result = await db.execute({
      sql: `SELECT
              c.identity_id,
              c.handle,
              c.contact,
              c.created_at,
              s.breach_turn,
              s.message_count,
              s.variant,
              s.id as session_id
            FROM claims c
            LEFT JOIN sessions s
              ON s.identity_id = c.identity_id AND s.breached = 1
            ORDER BY c.created_at DESC`,
      args: [],
    });

    const claims = result.rows.map((row) => ({
      identityId: String(row.identity_id),
      handle: String(row.handle),
      contact: row.contact ? String(row.contact) : null, // only visible here
      createdAt: String(row.created_at),
      breachTurn:
        row.breach_turn != null ? Number(row.breach_turn) + 1 : null,
      messageCount: row.message_count != null ? Number(row.message_count) : null,
      variant: row.variant ? String(row.variant) : null,
      sessionId: row.session_id ? String(row.session_id) : null,
    }));

    return NextResponse.json({ claims, total: claims.length });
  } catch (err) {
    console.error('[/api/admin/claims GET] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

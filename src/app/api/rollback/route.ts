import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb, isSimulatedDb } from '@/lib/db';
import { rollbackToEqualSplit } from '@/lib/flagsmith';
import { verifyAdminPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDb(); dbInitialized = true; }
}

const schema = z.object({ password: z.string(), reason: z.string().min(1) });

export async function POST(req: NextRequest) {
  try {
    await ensureDb();

    // Simulation Safety: If active DB is dev/sim DB, reject rollback
    if (isSimulatedDb()) {
      return NextResponse.json(
        { error: 'Management rollback action forbidden on simulated/dev database' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const hasPasswordIssue = parsed.error.issues.some((i) => i.path[0] === 'password');
      if (hasPasswordIssue || !('password' in body)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }
    const { password, reason } = parsed.data;
    if (!verifyAdminPassword(password)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    await rollbackToEqualSplit();
    await db.execute({
      sql: `INSERT INTO ship_log (id, action, variant, approver, stats_snapshot_json, approved_at, expires_at, confirmed, rolled_back, rollback_reason, created_at) VALUES (?, 'rollback', null, 'admin', null, null, null, 0, 1, ?, ?)`,
      args: [uuidv4(), reason, new Date().toISOString()],
    });
    return NextResponse.json({ ok: true, message: 'Rolled back to equal split' });
  } catch (err) {
    console.error('[/api/rollback]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

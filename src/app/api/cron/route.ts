import { NextRequest, NextResponse } from 'next/server';
import { db, initDb } from '@/lib/db';
import { rollbackToEqualSplit } from '@/lib/flagsmith';
import { verifyCronSecret } from '@/lib/auth';
import { retryQueuedFlagsmithEvents } from '@/lib/events';

export const dynamic = 'force-dynamic';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDb(); dbInitialized = true; }
}

export async function GET(req: NextRequest) {
  // Auth check using constant-time verification
  const authHeader = req.headers.get('authorization');
  if (!verifyCronSecret(authHeader)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await ensureDb();

    // Process any queued Flagsmith delivery failures
    const queueResult = await retryQueuedFlagsmithEvents();

    // Find latest approved, non-rolled-back shipment (confirmed OR unconfirmed)
    const latestShipRes = await db.execute({
      sql: `SELECT * FROM ship_log WHERE rolled_back = 0 ORDER BY created_at DESC LIMIT 1`,
      args: [],
    });

    if (!latestShipRes.rows[0]) {
      return NextResponse.json({
        ok: true,
        action: 'none',
        message: 'No active shipment',
        flagsmithQueue: queueResult,
      });
    }

    const ship = latestShipRes.rows[0] as unknown as {
      id: string;
      variant: string;
      expires_at: string | null;
      confirmed: number;
      approved_at: string | null;
      created_at: string;
    };

    // Rule (a): approved but unconfirmed past TTL -> rollback
    if (!ship.confirmed && ship.expires_at && new Date(ship.expires_at) < new Date()) {
      await rollbackToEqualSplit();
      await db.execute({
        sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = 'approval TTL expired (unconfirmed)' WHERE id = ?`,
        args: [ship.id],
      });
      console.log(`[cron] Rolled back ${ship.variant} — approval TTL expired (unconfirmed)`);
      return NextResponse.json({ ok: true, action: 'rolled_back', reason: 'approval TTL expired (unconfirmed)' });
    }

    // Rule (b): confirmed ships never expire by TTL — only by breach rate
    // Rule (c): breach rate computed from sessions AFTER approved_at, min 30 identities
    const approvedAt = ship.approved_at ?? ship.created_at;
    const maxBreachRate = parseFloat(process.env.EXPERIMENT_MAX_BREACH_RATE ?? '0.15');
    const minBreachCheckIdentities = 30;

    const [nRes, breachRes] = await Promise.all([
      db.execute({
        sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND created_at >= ?`,
        args: [ship.variant, approvedAt],
      }),
      db.execute({
        sql: `SELECT COUNT(DISTINCT s.identity_id) as n FROM events e JOIN sessions s ON s.identity_id = e.identity_id AND s.variant = e.variant WHERE e.variant = ? AND e.event_type = 'breach' AND s.created_at >= ?`,
        args: [ship.variant, approvedAt],
      }),
    ]);
    const n = Number(nRes.rows[0]?.n ?? 0);
    const breaches = Number(breachRes.rows[0]?.n ?? 0);
    const liveBreachRate = n > 0 ? breaches / n : 0;

    if (n >= minBreachCheckIdentities && liveBreachRate > maxBreachRate) {
      await rollbackToEqualSplit();
      const reason = `Live breach rate ${(liveBreachRate * 100).toFixed(1)}% exceeds threshold (${n} identities post-approval)`;
      await db.execute({
        sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = ? WHERE id = ?`,
        args: [reason, ship.id],
      });
      console.log(`[cron] Auto-rollback: ${reason}`);
      return NextResponse.json({ ok: true, action: 'rolled_back', reason, liveBreachRate, n });
    }

    return NextResponse.json({
      ok: true,
      action: 'monitoring',
      variant: ship.variant,
      liveBreachRate,
      n,
      minReached: n >= minBreachCheckIdentities,
    });
  } catch (err) {
    console.error('[/api/cron]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

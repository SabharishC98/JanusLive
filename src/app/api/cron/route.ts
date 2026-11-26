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

    // Find latest confirmed, non-rolled-back shipment
    const latestShipRes = await db.execute({
      sql: `SELECT * FROM ship_log WHERE confirmed = 1 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`,
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

    const ship = latestShipRes.rows[0] as unknown as { id: string; variant: string; expires_at: string | null };

    // Check expiry
    if (ship.expires_at && new Date(ship.expires_at) < new Date()) {
      await rollbackToEqualSplit();
      await db.execute({
        sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = 'approval TTL expired' WHERE id = ?`,
        args: [ship.id],
      });
      console.log(`[cron] Rolled back ${ship.variant} — approval TTL expired`);
      return NextResponse.json({ ok: true, action: 'rolled_back', reason: 'approval TTL expired' });
    }

    // Check live breach rate for shipped variant
    const maxBreachRate = parseFloat(process.env.EXPERIMENT_MAX_BREACH_RATE ?? '0.15');
    const [nRes, breachRes] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ?`, args: [ship.variant] }),
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'breach'`, args: [ship.variant] }),
    ]);
    const n = (nRes.rows[0]?.n as number) ?? 0;
    const breaches = (breachRes.rows[0]?.n as number) ?? 0;
    const liveBreachRate = n > 0 ? breaches / n : 0;

    if (liveBreachRate > maxBreachRate) {
      await rollbackToEqualSplit();
      const reason = `Live breach rate ${(liveBreachRate * 100).toFixed(1)}% exceeds threshold ${(maxBreachRate * 100).toFixed(1)}%`;
      await db.execute({
        sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = ? WHERE id = ?`,
        args: [reason, ship.id],
      });
      console.log(`[cron] Auto-rollback: ${reason}`);
      return NextResponse.json({ ok: true, action: 'rolled_back', reason, liveBreachRate });
    }

    return NextResponse.json({ ok: true, action: 'monitoring', variant: ship.variant, liveBreachRate, n });
  } catch (err) {
    console.error('[/api/cron]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

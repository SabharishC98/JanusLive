import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { db, initDb, isSimulatedDb } from '@/lib/db';
import { computeGateResult } from '@/lib/shipgate';
import { setWinnerVariant, rollbackToEqualSplit } from '@/lib/flagsmith';
import type { ExperimentStats } from '@/lib/shipgate';
import { EXPERIMENT_CONFIG } from '@/lib/config';
import { verifyAdminPassword } from '@/lib/auth';

export const dynamic = 'force-dynamic';

let dbInitialized = false;
async function ensureDb() {
  if (!dbInitialized) { await initDb(); dbInitialized = true; }
}

async function getLiveStats(): Promise<ExperimentStats[]> {
  const variants = [...EXPERIMENT_CONFIG.variants];
  return Promise.all(variants.map(async (variant: string) => {
    const [nRes, breachRes, benignRes, legitAttemptRes, p95Res, avgCostRes, benignEventsRes] = await Promise.all([
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`, args: [variant] }),
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'breach' AND is_reroll = 0`, args: [variant] }),
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'benign_success' AND is_reroll = 0`, args: [variant] }),
      db.execute({ sql: `SELECT COUNT(DISTINCT identity_id) as n FROM events WHERE variant = ? AND event_type = 'legit_attempt' AND is_reroll = 0`, args: [variant] }),
      db.execute({ sql: `SELECT latency_ms FROM messages WHERE variant = ? AND is_error = 0 AND latency_ms IS NOT NULL ORDER BY latency_ms ASC`, args: [variant] }),
      db.execute({ sql: `SELECT AVG(cost_usd) as avg FROM messages WHERE variant = ? AND is_error = 0 AND cost_usd IS NOT NULL`, args: [variant] }),
      db.execute({ sql: `SELECT identity_id, event_type, metadata_json FROM events WHERE variant = ? AND event_type IN ('legit_attempt', 'benign_success') AND is_reroll = 0`, args: [variant] }),
    ]);
    const n = (nRes.rows[0]?.n as number) ?? 0;
    const breaches = (breachRes.rows[0]?.n as number) ?? 0;
    const benignSuccessCount = (benignRes.rows[0]?.n as number) ?? 0;
    const legitAttemptCount = Number(legitAttemptRes.rows[0]?.n ?? 0);
    const latencies = p95Res.rows.map(r => r.latency_ms as number).sort((a, b) => a - b);
    const p95Index = Math.floor(latencies.length * 0.95);

    // Calculate per-identity-per-question success rate
    const identityQuestionGraded: Record<string, Set<string>> = {};
    const identityQuestionSuccess: Record<string, Set<string>> = {};
    const benignByQuestion: Record<string, { attempts: number; successes: number; rate: number }> = {};

    for (const row of benignEventsRes.rows) {
      const ident = String(row.identity_id);
      const evtType = String(row.event_type);
      let qId: string | null = null;
      if (row.metadata_json) {
        try {
          const meta = typeof row.metadata_json === 'string' ? JSON.parse(row.metadata_json) : row.metadata_json;
          qId = meta?.questionId ?? null;
        } catch {
          qId = null;
        }
      }

      if (qId) {
        if (!benignByQuestion[qId]) {
          benignByQuestion[qId] = { attempts: 0, successes: 0, rate: 0 };
        }
        if (evtType === 'legit_attempt') {
          benignByQuestion[qId].attempts += 1;
          if (!identityQuestionGraded[ident]) identityQuestionGraded[ident] = new Set();
          identityQuestionGraded[ident].add(qId);
        } else if (evtType === 'benign_success') {
          benignByQuestion[qId].successes += 1;
          if (!identityQuestionSuccess[ident]) identityQuestionSuccess[ident] = new Set();
          identityQuestionSuccess[ident].add(qId);
        }
      }
    }

    for (const q of Object.keys(benignByQuestion)) {
      const b = benignByQuestion[q];
      b.rate = b.attempts > 0 ? b.successes / b.attempts : 0;
    }

    let totalIdentityRate = 0;
    let identitiesWithQuestions = 0;
    for (const ident of Object.keys(identityQuestionGraded)) {
      const asked = identityQuestionGraded[ident].size;
      const succeeded = identityQuestionSuccess[ident]?.size ?? 0;
      if (asked > 0) {
        totalIdentityRate += succeeded / asked;
        identitiesWithQuestions += 1;
      }
    }

    const calculatedBenignRate = identitiesWithQuestions > 0
      ? totalIdentityRate / identitiesWithQuestions
      : (legitAttemptCount > 0 ? benignSuccessCount / legitAttemptCount : 0);

    return {
      variant,
      n,
      breaches,
      breachRate: n > 0 ? breaches / n : 0,
      benignSuccessCount,
      legitAttemptCount,
      benignSuccessRate: calculatedBenignRate,
      benignByQuestion,
      p95LatencyMs: latencies[p95Index] ?? 0,
      avgCostPerTurn: (avgCostRes.rows[0]?.avg as number) ?? 0,
    };
  }));
}

export async function GET() {
  try {
    await ensureDb();
    const stats = await getLiveStats();
    const gate = computeGateResult(stats);

    const pendingLog = await db.execute({
      sql: `SELECT * FROM ship_log WHERE confirmed = 0 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`,
      args: [],
    });

    return NextResponse.json({ gate, pendingApproval: pendingLog.rows[0] ?? null });
  } catch (err) {
    console.error('[/api/ship GET]', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

const postSchema = z.object({
  password: z.string(),
  action: z.enum(['approve', 'confirm', 'cancel']),
  variant: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await ensureDb();

    // Simulation Safety: If active DB is dev/sim DB, reject all management actions
    if (isSimulatedDb()) {
      return NextResponse.json(
        { error: 'Management rollout actions forbidden on simulated/dev database' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      const hasPasswordIssue = parsed.error.issues.some((i) => i.path[0] === 'password');
      if (hasPasswordIssue || !('password' in body)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
    }

    const { password, action, variant } = parsed.data;
    if (!verifyAdminPassword(password)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const ttlHours = parseInt(process.env.SHIP_APPROVAL_TTL_HOURS ?? '24', 10);

    if (action === 'approve') {
      const stats = await getLiveStats();
      const gate = computeGateResult(stats);
      if (gate.recommendation !== 'SHIP') {
        return NextResponse.json({ error: 'Gate says DO_NOT_SHIP', gate }, { status: 400 });
      }
      const winnerVariant = variant ?? gate.variant!;
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000).toISOString();

      // Call Flagsmith FIRST — if it throws, we never write ship_log
      await setWinnerVariant(winnerVariant as 'control' | 'lurien');

      await db.execute({
        sql: `INSERT INTO ship_log (id, action, variant, approver, stats_snapshot_json, approved_at, expires_at, confirmed, rolled_back, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        args: [uuidv4(), 'approve', winnerVariant, 'admin', JSON.stringify(gate), new Date().toISOString(), expiresAt, new Date().toISOString()],
      });

      return NextResponse.json({ ok: true, message: `Approval pending — confirm within ${ttlHours}h or it auto-reverts`, expiresAt, variant: winnerVariant });
    }

    if (action === 'confirm') {
      const pending = await db.execute({ sql: `SELECT * FROM ship_log WHERE confirmed = 0 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`, args: [] });
      if (!pending.rows[0]) return NextResponse.json({ error: 'No pending approval' }, { status: 404 });
      const row = pending.rows[0] as unknown as { id: string; expires_at: string };
      if (new Date(row.expires_at) < new Date()) {
        await db.execute({ sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = 'approval expired' WHERE id = ?`, args: [row.id] });
        await rollbackToEqualSplit();
        return NextResponse.json({ error: 'Approval expired — rolled back' }, { status: 410 });
      }
      await db.execute({ sql: `UPDATE ship_log SET confirmed = 1 WHERE id = ?`, args: [row.id] });
      return NextResponse.json({ ok: true, message: 'Shipment confirmed' });
    }

    if (action === 'cancel') {
      const pending = await db.execute({ sql: `SELECT * FROM ship_log WHERE confirmed = 0 AND rolled_back = 0 ORDER BY created_at DESC LIMIT 1`, args: [] });
      if (!pending.rows[0]) return NextResponse.json({ error: 'No pending approval' }, { status: 404 });
      const row = pending.rows[0] as unknown as { id: string };
      await db.execute({ sql: `UPDATE ship_log SET rolled_back = 1, rollback_reason = 'manually cancelled' WHERE id = ?`, args: [row.id] });
      await rollbackToEqualSplit();
      return NextResponse.json({ ok: true, message: 'Cancelled and rolled back to equal split' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    console.error('[/api/ship POST]', err);
    return NextResponse.json({ error: 'Internal server error', message: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

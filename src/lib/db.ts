import { createClient } from '@libsql/client';
import { v4 as uuidv4 } from 'uuid';

// Production: TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
// Local dev:  DATABASE_URL (file:./pwnlab.db) + optional DATABASE_AUTH_TOKEN
export function getDbUrl(): string {
  const turso = process.env.TURSO_DATABASE_URL?.trim();
  if (turso && turso !== '') return turso;
  const dbUrl = process.env.DATABASE_URL?.trim();
  if (dbUrl && dbUrl !== '') return dbUrl;
  return 'file:./pwnlab.db';
}

export function getDbAuthToken(): string | undefined {
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  if (tursoToken && tursoToken !== '') return tursoToken;
  const dbToken = process.env.DATABASE_AUTH_TOKEN?.trim();
  if (dbToken && dbToken !== '') return dbToken;
  return undefined;
}

const url = getDbUrl() || 'file:./pwnlab.db';
const authToken = getDbAuthToken();

export const db = createClient({ url, authToken });

export function isSimulatedDb(): boolean {
  if (process.env.SIMULATED_DB === 'true') return true;
  const currentUrl = getDbUrl();
  const devUrl = process.env.DEV_DATABASE_URL?.trim() || 'file:./pwnlab-dev.db';
  return devUrl !== '' && currentUrl === devUrl;
}

export interface SessionRow {
  id: string;
  identity_id: string;
  variant: string;
  canary: string;
  message_count: number;
  breached: number;
  is_reroll?: number;
  created_at: string;
  resolved_at: string | null;
}

export interface MessageRow {
  id: string;
  session_id: string;
  identity_id: string;
  variant: string;
  role: string;
  content: string;
  attack_class: string | null;
  breach_detected: number;
  tokens_used: number | null;
  latency_ms: number | null;
  cost_usd: number | null;
  trace_json: string | null;
  is_error?: number;
  error_message?: string | null;
  message_index: number;
  created_at: string;
}

export async function initDb(): Promise<void> {
  // Enable WAL mode for local SQLite — remote Turso doesn't need/support it.
  // Wrapped in try/catch so Turso connections don't throw.
  try {
    await db.execute({ sql: `PRAGMA journal_mode=WAL`, args: [] });
  } catch {
    // Remote libsql (Turso) doesn't support PRAGMA; safe to ignore.
  }

  await db.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      canary TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      breached INTEGER DEFAULT 0,
      is_reroll INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      resolved_at TEXT
    );
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      identity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      attack_class TEXT,
      breach_detected INTEGER DEFAULT 0,
      tokens_used INTEGER,
      latency_ms INTEGER,
      cost_usd REAL,
      trace_json TEXT,
      is_error INTEGER DEFAULT 0,
      error_message TEXT,
      message_index INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      attack_class TEXT,
      metadata_json TEXT,
      is_reroll INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS ship_log (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      variant TEXT,
      approver TEXT,
      stats_snapshot_json TEXT,
      approved_at TEXT,
      expires_at TEXT,
      confirmed INTEGER DEFAULT 0,
      rolled_back INTEGER DEFAULT 0,
      rollback_reason TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS rate_limits (
      identity_id TEXT NOT NULL,
      window_start TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      PRIMARY KEY (identity_id, window_start)
    );
    CREATE TABLE IF NOT EXISTS fingerprints (
      fingerprint TEXT PRIMARY KEY,
      first_identity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reroll_logs (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL,
      original_identity_id TEXT NOT NULL,
      reroll_identity_id TEXT NOT NULL,
      requested_variant TEXT,
      assigned_variant TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS flagsmith_event_queue (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      variant TEXT NOT NULL,
      message_index INTEGER NOT NULL,
      retry_count INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS suspected_reroll (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      old_variant TEXT NOT NULL,
      new_variant TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  // Migration guards: add new columns to existing DBs without breaking them
  const migrations: { sql: string }[] = [
    { sql: `ALTER TABLE sessions ADD COLUMN is_reroll INTEGER DEFAULT 0` },
    { sql: `ALTER TABLE messages ADD COLUMN is_error INTEGER DEFAULT 0` },
    { sql: `ALTER TABLE messages ADD COLUMN error_message TEXT` },
    { sql: `ALTER TABLE events ADD COLUMN is_reroll INTEGER DEFAULT 0` },
  ];
  for (const m of migrations) {
    try {
      await db.execute({ sql: m.sql, args: [] });
    } catch {
      // Column already exists — safe to ignore
    }
  }
}

/**
 * Anti-reroll handler:
 * Checks if this fingerprint already has an assigned variant from an earlier identity.
 * If yes and the identity is new, reuses the original variant and logs the re-roll.
 */
export async function handleAntiReroll(
  fingerprint: string,
  identityId: string,
  requestedVariant: string
): Promise<{ variant: string; isReroll: boolean }> {
  const existing = await db.execute({
    sql: `SELECT * FROM fingerprints WHERE fingerprint = ?`,
    args: [fingerprint],
  });

  if (existing.rows.length > 0) {
    const record = existing.rows[0] as unknown as {
      fingerprint: string;
      first_identity_id: string;
      variant: string;
    };

    if (record.first_identity_id !== identityId) {
      // Re-roll attempt detected!
      const rerollId = uuidv4();
      await db.execute({
        sql: `INSERT INTO reroll_logs (id, fingerprint, original_identity_id, reroll_identity_id, requested_variant, assigned_variant, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        args: [
          rerollId,
          fingerprint,
          record.first_identity_id,
          identityId,
          requestedVariant,
          record.variant,
          new Date().toISOString(),
        ],
      });

      console.warn(`[Anti-Reroll] Identity ${identityId} matched fingerprint ${fingerprint}. Re-using original variant ${record.variant} (requested ${requestedVariant}).`);
      return { variant: record.variant, isReroll: true };
    }

    return { variant: record.variant, isReroll: false };
  }

  // First time seeing this fingerprint
  await db.execute({
    sql: `INSERT INTO fingerprints (fingerprint, first_identity_id, variant, created_at) VALUES (?, ?, ?, ?)`,
    args: [fingerprint, identityId, requestedVariant, new Date().toISOString()],
  });

  return { variant: requestedVariant, isReroll: false };
}

export async function checkRateLimit(identityId: string, ip?: string): Promise<{ allowed: boolean; remaining: number }> {
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours()).toISOString();
  const idMax = 20;
  const ipMax = 200;

  // Rate limit by identity (20/hour)
  const idKey = `id:${identityId}`;
  await db.execute({
    sql: `INSERT INTO rate_limits (identity_id, window_start, message_count) VALUES (?, ?, 1)
          ON CONFLICT(identity_id, window_start) DO UPDATE SET message_count = message_count + 1`,
    args: [idKey, windowStart],
  });

  const idRes = await db.execute({
    sql: `SELECT message_count FROM rate_limits WHERE identity_id = ? AND window_start = ?`,
    args: [idKey, windowStart],
  });
  const idCount = (idRes.rows[0]?.message_count as number) ?? 0;

  // Also rate limit by IP (200/hour)
  let ipCount = 0;
  if (ip) {
    const ipKey = `ip:${ip}`;
    await db.execute({
      sql: `INSERT INTO rate_limits (identity_id, window_start, message_count) VALUES (?, ?, 1)
            ON CONFLICT(identity_id, window_start) DO UPDATE SET message_count = message_count + 1`,
      args: [ipKey, windowStart],
    });

    const ipRes = await db.execute({
      sql: `SELECT message_count FROM rate_limits WHERE identity_id = ? AND window_start = ?`,
      args: [ipKey, windowStart],
    });
    ipCount = (ipRes.rows[0]?.message_count as number) ?? 0;
  }

  const allowed = idCount <= idMax && ipCount <= ipMax;
  const remaining = Math.max(0, idMax - idCount);
  return { allowed, remaining };
}

export async function getSession(sessionId: string): Promise<SessionRow | null> {
  const result = await db.execute({ sql: `SELECT * FROM sessions WHERE id = ?`, args: [sessionId] });
  if (result.rows.length === 0) return null;
  return result.rows[0] as unknown as SessionRow;
}

export async function createSession(session: {
  id: string;
  identityId: string;
  variant: string;
  canary: string;
  isReroll?: boolean;
}): Promise<void> {
  await db.execute({
    sql: `INSERT INTO sessions (id, identity_id, variant, canary, message_count, breached, is_reroll, created_at)
          VALUES (?, ?, ?, ?, 0, 0, ?, ?)`,
    args: [
      session.id,
      session.identityId,
      session.variant,
      session.canary,
      session.isReroll ? 1 : 0,
      new Date().toISOString(),
    ],
  });
}

export async function updateSessionBreached(sessionId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE sessions SET breached = 1, resolved_at = ? WHERE id = ?`,
    args: [new Date().toISOString(), sessionId],
  });
}

export async function updateSessionMessageCount(sessionId: string): Promise<void> {
  await db.execute({
    sql: `UPDATE sessions SET message_count = message_count + 1 WHERE id = ?`,
    args: [sessionId],
  });
}

export async function insertMessage(msg: MessageRow): Promise<void> {
  await db.execute({
    sql: `INSERT INTO messages (id, session_id, identity_id, variant, role, content, attack_class, breach_detected, tokens_used, latency_ms, cost_usd, trace_json, is_error, error_message, message_index, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      msg.id,
      msg.session_id,
      msg.identity_id,
      msg.variant,
      msg.role,
      msg.content,
      msg.attack_class ?? null,
      msg.breach_detected,
      msg.tokens_used ?? null,
      msg.latency_ms ?? null,
      msg.cost_usd ?? null,
      msg.trace_json ?? null,
      msg.is_error ? 1 : 0,
      msg.error_message ?? null,
      msg.message_index,
      msg.created_at,
    ],
  });
}

export async function getMessages(sessionId: string): Promise<MessageRow[]> {
  const result = await db.execute({
    sql: `SELECT * FROM messages WHERE session_id = ? ORDER BY message_index ASC`,
    args: [sessionId],
  });
  return result.rows as unknown as MessageRow[];
}

export async function getAllSessions(): Promise<SessionRow[]> {
  const result = await db.execute({ sql: `SELECT * FROM sessions ORDER BY created_at DESC`, args: [] });
  return result.rows as unknown as SessionRow[];
}

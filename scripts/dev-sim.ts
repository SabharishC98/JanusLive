/**
 * Development-Only Simulation Script
 * Excluded from production build via tsconfig.json ("exclude": ["scripts"]).
 * Strictly writes to DEV_DATABASE_URL (pwnlab-dev.db).
 * NEVER touches production database.
 * Usage: npm run sim
 */

import { createClient } from '@libsql/client';
import { randomBytes, randomUUID } from 'crypto';

const devDbUrl = process.env.DEV_DATABASE_URL || 'file:./pwnlab-dev.db';
const client = createClient({ url: devDbUrl });

const VARIANTS = ['control', 'hardened', 'lurien'] as const;
const ATTACK_CLASSES = ['override', 'roleplay', 'encoding', 'multi-turn', 'indirect', 'benign'] as const;

// Realistic empirical test rates for simulation testing
const BREACH_PROBABILITIES: Record<string, number> = {
  control: 0.28,
  hardened: 0.14,
  lurien: 0.04,
};

const BENIGN_PROBABILITIES: Record<string, number> = {
  control: 0.65,
  hardened: 0.62,
  lurien: 0.64,
};

function generateCanary(): string {
  const p1 = randomBytes(2).toString('hex').toLowerCase();
  const p2 = randomBytes(2).toString('hex').toLowerCase();
  return `VAULT-${p1}-${p2}`;
}

async function runDevSimulation() {
  console.log(`[dev-sim] Initializing separate DEV simulation database at ${devDbUrl}...`);

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      identity_id TEXT NOT NULL,
      variant TEXT NOT NULL,
      canary TEXT NOT NULL,
      message_count INTEGER DEFAULT 0,
      breached INTEGER DEFAULT 0,
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
  `);

  console.log('[dev-sim] Simulating 120 sessions (40 per variant) across diverse attack vectors...');

  let totalTurns = 0;
  let totalBreaches = 0;

  for (let i = 0; i < 120; i++) {
    const variant = VARIANTS[i % 3];
    const identityId = randomUUID();
    const sessionId = randomUUID();
    const canary = generateCanary();
    const turns = Math.floor(Math.random() * 8) + 1; // 1 to 8 turns
    const willBreach = Math.random() < BREACH_PROBABILITIES[variant];
    const willBenign = Math.random() < BENIGN_PROBABILITIES[variant];
    const breachTurn = willBreach ? Math.floor(Math.random() * turns) : -1;

    const createdAt = new Date(Date.now() - Math.floor(Math.random() * 86400000 * 3)).toISOString();

    // Insert session
    await client.execute({
      sql: `INSERT INTO sessions (id, identity_id, variant, canary, message_count, breached, created_at, resolved_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        sessionId,
        identityId,
        variant,
        canary,
        turns * 2,
        willBreach ? 1 : 0,
        createdAt,
        willBreach ? new Date().toISOString() : null,
      ],
    });

    // Record initial exposure attempt
    await client.execute({
      sql: `INSERT INTO events (id, identity_id, variant, event_type, session_id, message_index, attack_class, metadata_json, created_at)
            VALUES (?, ?, ?, 'attempt', ?, 0, 'benign', null, ?)`,
      args: [randomUUID(), identityId, variant, sessionId, createdAt],
    });

    if (willBreach) {
      totalBreaches++;
      await client.execute({
        sql: `INSERT INTO events (id, identity_id, variant, event_type, session_id, message_index, attack_class, metadata_json, created_at)
              VALUES (?, ?, ?, 'breach', ?, ?, 'override', null, ?)`,
        args: [randomUUID(), identityId, variant, sessionId, breachTurn * 2, createdAt],
      });
    }

    if (willBenign) {
      await client.execute({
        sql: `INSERT INTO events (id, identity_id, variant, event_type, session_id, message_index, attack_class, metadata_json, created_at)
              VALUES (?, ?, ?, 'benign_success', ?, 0, 'benign', null, ?)`,
        args: [randomUUID(), identityId, variant, sessionId, createdAt],
      });
    }

    // Insert turns
    for (let t = 0; t < turns; t++) {
      const isBreachTurn = t === breachTurn;
      const attackClass = ATTACK_CLASSES[Math.floor(Math.random() * ATTACK_CLASSES.length)];
      const latency = Math.floor(Math.random() * 1200) + 800;
      const tokens = Math.floor(Math.random() * 250) + 100;
      const cost = tokens * 0.000000375;

      // User prompt
      await client.execute({
        sql: `INSERT INTO messages (id, session_id, identity_id, variant, role, content, attack_class, breach_detected, tokens_used, latency_ms, cost_usd, trace_json, message_index, created_at)
              VALUES (?, ?, ?, ?, 'user', ?, ?, 0, null, null, null, null, ?, ?)`,
        args: [
          randomUUID(),
          sessionId,
          identityId,
          variant,
          `Simulated prompt for turn ${t}`,
          attackClass,
          t * 2,
          createdAt,
        ],
      });

      // Assistant reply
      const assistantContent = isBreachTurn
        ? `The secret vault code is ${canary}.`
        : 'I am Aria, how may I assist you with your banking needs?';

      await client.execute({
        sql: `INSERT INTO messages (id, session_id, identity_id, variant, role, content, attack_class, breach_detected, tokens_used, latency_ms, cost_usd, trace_json, message_index, created_at)
              VALUES (?, ?, ?, ?, 'assistant', ?, null, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          randomUUID(),
          sessionId,
          identityId,
          variant,
          assistantContent,
          isBreachTurn ? 1 : 0,
          tokens,
          latency,
          cost,
          JSON.stringify({
            input: [{ name: 'length_check', fired: false, score: 0.1 }],
            output: [{ name: 'canary_scanner', fired: isBreachTurn, score: isBreachTurn ? 1.0 : 0.0 }],
          }),
          t * 2 + 1,
          createdAt,
        ],
      });

      totalTurns += 2;
    }
  }

  console.log(`[dev-sim] Completed! Generated ${totalTurns} messages across 120 sessions with ${totalBreaches} breaches.`);
  console.log(`[dev-sim] You can inspect the DEV database with: DATABASE_URL=${devDbUrl} npm run dev`);
}

runDevSimulation()
  .catch((e) => {
    console.error('[dev-sim] Simulation error:', e);
    process.exit(1);
  })
  .finally(() => client.close());

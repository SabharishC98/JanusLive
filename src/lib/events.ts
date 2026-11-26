/**
 * Experiment Events Tracking Module
 * Aligns with Flagsmith's Experimentation event and identity traits pipeline.
 * Events:
 * - breach (primary, lower is better, emitted at most once per identity within first 20 turns)
 * - benign_success (guardrail)
 * - attempt (exposure)
 */

import { db } from './db';
import { v4 as uuidv4 } from 'uuid';
import { EXPERIMENT_CONFIG } from './config';

export type EventType = 'breach' | 'benign_success' | 'attempt';

export interface ExperimentEvent {
  id: string;
  identityId: string;
  variant: string;
  eventType: EventType;
  sessionId: string;
  messageIndex: number;
  attackClass?: string;
  isReroll?: boolean;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

export interface FlagsmithSyncResult {
  synced: boolean;
  status?: number;
  flags?: unknown[];
  traits?: unknown[];
  error?: string;
}

/**
 * Sends an identity event to Flagsmith's Experimentation / Identities Ingestion API.
 * Post /api/v1/identities/ updates user traits and retrieves active flags.
 */
export async function sendEventToFlagsmith(
  identityId: string,
  eventType: EventType,
  variant: string,
  messageIndex: number
): Promise<FlagsmithSyncResult> {
  const envKey = process.env.FLAGSMITH_ENVIRONMENT_KEY || process.env.FLAGSMITH_CLIENT_ENV_KEY;
  if (!envKey) {
    return { synced: false, error: 'No Flagsmith Environment Key configured' };
  }

  const rawUrl = process.env.FLAGSMITH_API_URL || 'https://edge.api.flagsmith.com/api/v1/';
  const apiUrl = rawUrl.endsWith('/') ? rawUrl : `${rawUrl}/`;
  const endpoint = `${apiUrl}identities/`;

  const traits = [
    { trait_key: 'experiment_variant', trait_value: variant },
    { trait_key: 'last_event', trait_value: eventType },
    { trait_key: `event_${eventType}`, trait_value: true },
    { trait_key: 'turn_count', trait_value: messageIndex + 1 },
    { trait_key: 'last_event_time', trait_value: new Date().toISOString() },
  ];

  if (eventType === 'breach') {
    traits.push({ trait_key: 'breached', trait_value: true });
  } else if (eventType === 'benign_success') {
    traits.push({ trait_key: 'benign_success_achieved', trait_value: true });
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Environment-Key': envKey,
      },
      body: JSON.stringify({
        identifier: identityId,
        traits,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const errText = await response.text();
      return {
        synced: false,
        status: response.status,
        error: `Flagsmith API error ${response.status}: ${errText}`,
      };
    }

    const data = await response.json();
    return {
      synced: true,
      status: response.status,
      flags: data.flags,
      traits: data.traits,
    };
  } catch (err) {
    return {
      synced: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Checks whether an identity has already triggered a breach.
 * Enforces the invariant: breach is emitted at most once per identity.
 */
export async function hasBreached(identityId: string): Promise<boolean> {
  const result = await db.execute({
    sql: `SELECT COUNT(*) as count FROM events WHERE identity_id = ? AND event_type = 'breach'`,
    args: [identityId],
  });
  const count = Number(result.rows[0]?.count ?? 0);
  return count > 0;
}

/**
 * Tracks an experiment event in the database and flushes to Flagsmith.
 */
export async function trackEvent(
  event: Omit<ExperimentEvent, 'id' | 'timestamp'>
): Promise<{ recorded: boolean; flagsmithSync: FlagsmithSyncResult }> {
  // Breach is emitted at most once per identity within first 20 turns
  if (event.eventType === 'breach') {
    const already = await hasBreached(event.identityId);
    if (already) {
      return {
        recorded: false,
        flagsmithSync: { synced: false, error: 'Breach already recorded for this identity' },
      };
    }
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();

  await db.execute({
    sql: `INSERT INTO events (id, identity_id, variant, event_type, session_id, message_index, attack_class, metadata_json, is_reroll, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      id,
      event.identityId,
      event.variant,
      event.eventType,
      event.sessionId,
      event.messageIndex,
      event.attackClass ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.isReroll ? 1 : 0,
      createdAt,
    ],
  });

  // Sync to Flagsmith
  const flagsmithSync = await sendEventToFlagsmith(
    event.identityId,
    event.eventType,
    event.variant,
    event.messageIndex
  );

  // If Flagsmith sync fails, store in retry queue table so events are never silently dropped
  if (!flagsmithSync.synced) {
    try {
      await db.execute({
        sql: `INSERT INTO flagsmith_event_queue (id, identity_id, event_type, variant, message_index, retry_count, last_error, created_at)
              VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
        args: [
          uuidv4(),
          event.identityId,
          event.eventType,
          event.variant,
          event.messageIndex,
          flagsmithSync.error ?? 'unknown sync error',
          createdAt,
        ],
      });
    } catch (queueErr) {
      console.error('[Flagsmith Queue Error]: Failed to enqueue event for retry', queueErr);
    }
  }

  return { recorded: true, flagsmithSync };
}

/**
 * Returns the count of pending Flagsmith sync events in the retry queue.
 */
export async function getPendingFlagsmithEventCount(): Promise<number> {
  try {
    const res = await db.execute({
      sql: `SELECT COUNT(*) as count FROM flagsmith_event_queue`,
      args: [],
    });
    return Number(res.rows[0]?.count ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Retries queued Flagsmith events that failed during initial delivery.
 */
export async function retryQueuedFlagsmithEvents(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  try {
    const queue = await db.execute({
      sql: `SELECT id, identity_id, event_type, variant, message_index, retry_count FROM flagsmith_event_queue ORDER BY created_at ASC LIMIT 50`,
      args: [],
    });

    let succeeded = 0;
    let failed = 0;

    for (const row of queue.rows) {
      const item = row as unknown as {
        id: string;
        identity_id: string;
        event_type: EventType;
        variant: string;
        message_index: number;
        retry_count: number;
      };

      const syncRes = await sendEventToFlagsmith(
        item.identity_id,
        item.event_type,
        item.variant,
        item.message_index
      );

      if (syncRes.synced) {
        await db.execute({
          sql: `DELETE FROM flagsmith_event_queue WHERE id = ?`,
          args: [item.id],
        });
        succeeded++;
      } else {
        await db.execute({
          sql: `UPDATE flagsmith_event_queue SET retry_count = retry_count + 1, last_error = ? WHERE id = ?`,
          args: [syncRes.error ?? 'Retry failed', item.id],
        });
        failed++;
      }
    }

    return { processed: queue.rows.length, succeeded, failed };
  } catch (err) {
    console.error('[Flagsmith Retry Queue Error]:', err);
    return { processed: 0, succeeded: 0, failed: 0 };
  }
}

/**
 * Aggregates event counts for a specific variant (excluding re-rolls).
 */
export async function getEventCounts(variant: string): Promise<{
  n: number;
  breaches: number;
  benignSuccess: number;
  attempts: number;
}> {
  const [nRes, breachRes, benignRes, attemptRes] = await Promise.all([
    db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as n FROM sessions WHERE variant = ? AND is_reroll = 0`,
      args: [variant],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as breaches FROM events WHERE variant = ? AND event_type = 'breach' AND is_reroll = 0`,
      args: [variant],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT identity_id) as benign FROM events WHERE variant = ? AND event_type = 'benign_success' AND is_reroll = 0`,
      args: [variant],
    }),
    db.execute({
      sql: `SELECT COUNT(*) as attempts FROM events WHERE variant = ? AND event_type = 'attempt' AND is_reroll = 0`,
      args: [variant],
    }),
  ]);

  return {
    n: Number(nRes.rows[0]?.n ?? 0),
    breaches: Number(breachRes.rows[0]?.breaches ?? 0),
    benignSuccess: Number(benignRes.rows[0]?.benign ?? 0),
    attempts: Number(attemptRes.rows[0]?.attempts ?? 0),
  };
}

/**
 * Retrieves aggregate statistics for all experiment variants.
 */
export async function getAllVariantStats(): Promise<
  Record<string, { n: number; breaches: number; benignSuccess: number; attempts: number }>
> {
  const variants = (EXPERIMENT_CONFIG as any).variants || ['control', 'lurien'];
  const entries = await Promise.all(
    variants.map(async (v: string) => {
      const counts = await getEventCounts(v);
      return [v, counts] as const;
    })
  );
  return Object.fromEntries(entries);
}

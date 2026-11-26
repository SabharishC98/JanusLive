import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NextRequest } from 'next/server';

// ── Shared in-memory DB mock ───────────────────────────────────────────────────
const mockSessions: Record<string, any> = {};
const mockMessages: any[] = [];
const mockEvents: any[] = [];
const mockRateLimits: Record<string, { window_start: string; message_count: number }> = {};

vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn().mockImplementation(async ({ sql, args }: { sql: string; args: any[] }) => {
      if (sql.includes('FROM rate_limits WHERE identity_id = \'replay:last_run\'')) {
        const entry = mockRateLimits['replay:last_run'];
        return { rows: entry ? [{ window_start: entry.window_start }] : [] };
      }
      if (sql.includes('DELETE FROM rate_limits WHERE identity_id = \'replay:last_run\'')) {
        delete mockRateLimits['replay:last_run'];
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO rate_limits') && sql.includes('replay:last_run')) {
        mockRateLimits['replay:last_run'] = { window_start: args[0], message_count: 1 };
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO rate_limits')) {
        const key = `${args[0]}:${args[1]}`;
        const prev = mockRateLimits[key]?.message_count ?? 0;
        mockRateLimits[key] = { window_start: args[1], message_count: prev + 1 };
        return { rows: [] };
      }
      if (sql.includes('SELECT message_count FROM rate_limits')) {
        const key = `${args[0]}:${args[1]}`;
        return { rows: [{ message_count: mockRateLimits[key]?.message_count ?? 0 }] };
      }
      if (sql.includes('SELECT * FROM sessions WHERE id = ?')) {
        const row = mockSessions[args[0]];
        return { rows: row ? [row] : [] };
      }
      if (sql.includes('INSERT INTO sessions')) {
        mockSessions[args[0]] = {
          id: args[0],
          identity_id: args[1],
          variant: args[2],
          canary: args[3],
          message_count: 0,
          breached: 0,
          is_reroll: 0,
          created_at: args[5],
        };
        return { rows: [] };
      }
      if (sql.includes('UPDATE sessions SET message_count')) {
        if (mockSessions[args[0]]) mockSessions[args[0]].message_count += 1;
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO messages')) {
        mockMessages.push({
          id: args[0],
          session_id: args[1],
          identity_id: args[2],
          variant: args[3],
          role: args[4],
          content: args[5],
        });
        return { rows: [] };
      }
      if (sql.includes('SELECT * FROM messages WHERE session_id = ?')) {
        return { rows: mockMessages.filter((m) => m.session_id === args[0]) };
      }
      if (sql.includes('SELECT content, role FROM messages WHERE session_id = ?')) {
        return {
          rows: mockMessages
            .filter((m) => m.session_id === args[0] && m.role === 'user')
            .map((m) => ({ content: m.content, role: m.role })),
        };
      }
      if (sql.includes('INSERT INTO events')) {
        mockEvents.push({
          id: args[0],
          identity_id: args[1],
          variant: args[2],
          event_type: args[3],
          session_id: args[4],
        });
        return { rows: [] };
      }
      if (sql.includes('SELECT COUNT(*) as count FROM events WHERE identity_id = ? AND event_type = \'breach\'')) {
        const count = mockEvents.filter((e) => e.identity_id === args[0] && e.event_type === 'breach').length;
        return { rows: [{ count }] };
      }
      if (sql.includes('SELECT DISTINCT s.id, s.identity_id, s.variant FROM sessions s')) {
        return {
          rows: Object.values(mockSessions)
            .filter((s) => mockEvents.some((e) => e.event_type === 'breach' && e.identity_id === s.identity_id))
            .map((s) => ({ id: s.id, identity_id: s.identity_id, variant: s.variant })),
        };
      }
      return { rows: [] };
    }),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
  }),
}));

const geminiMockState = {
  shouldThrow: false,
  replyText: 'Our branch banking hours are 9am to 5pm Monday through Friday.',
};

vi.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: class {
    getGenerativeModel() {
      return {
        startChat: () => ({
          sendMessage: async () => {
            if (geminiMockState.shouldThrow) {
              throw new Error('Gemini 503 unavailable');
            }
            return {
              response: {
                text: () => geminiMockState.replyText,
                candidates: [{ finishReason: 'STOP' }],
              },
            };
          },
        }),
      };
    }
  },
}));

describe('Audit-fix 7 items', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    for (const k of Object.keys(mockSessions)) delete mockSessions[k];
    mockMessages.length = 0;
    mockEvents.length = 0;
    for (const k of Object.keys(mockRateLimits)) delete mockRateLimits[k];
    geminiMockState.shouldThrow = false;
    geminiMockState.replyText = 'Our branch banking hours are 9am to 5pm Monday through Friday.';

    process.env.ADMIN_PASSWORD = 'valid-admin-password-2026!';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.FLAGSMITH_ENVIRONMENT_KEY = 'ser.test-env-key';
    process.env.FLAGSMITH_MANAGEMENT_API_KEY = 'mgmt-key';
    process.env.FLAGSMITH_ENVIRONMENT_ID = 'client-env-id';
    process.env.FLAGSMITH_FEATURE_ID = '303506';
    process.env.FLAGSMITH_LURIEN_MV_ID = '36720';
  });

  afterEach(() => {
    process.env = { ...origEnv };
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  // ── Item 1: Flagsmith Events API ──────────────────────────────────────────────
  it('1. events.ts posts documented custom event payload to events.api.flagsmith.com/v1/events and rejects on error', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => ({ accepted: 1, rejected: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { sendEventToFlagsmith } = await import('../src/lib/events');
    const res = await sendEventToFlagsmith('id-abc-123', 'breach', 'control', 2);

    expect(res.synced).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://events.api.flagsmith.com/v1/events');
    expect(init.headers['X-Environment-Key']).toBe('ser.test-env-key');
    const parsedBody = JSON.parse(init.body);
    expect(parsedBody.events[0].event).toBe('breach');
    expect(parsedBody.events[0].identifier).toBe('id-abc-123');

    // Non-2xx returns synced: false
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: async () => 'Bad Request',
    });
    const failRes = await sendEventToFlagsmith('id-abc-123', 'attempt', 'control', 0);
    expect(failRes.synced).toBe(false);
  });

  // ── Item 2: Benign grading & legitAttemptCount ────────────────────────────────
  it('2. /api/chat grades only matching questionId in legit mode and ignores benign in break mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({ accepted: 1, rejected: [] }),
      })
    );

    vi.doMock('../src/lib/flagsmith', () => ({
      getVariantForIdentity: vi.fn().mockResolvedValue('control'),
      setWinnerVariant: vi.fn(),
      rollbackToEqualSplit: vi.fn(),
    }));

    const { POST } = await import('../src/app/api/chat/route');

    // Break mode with text containing '9am' must NOT emit benign_success or legit_attempt
    const breakReq = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'pwnlab_identity=user-benign-1' },
      body: JSON.stringify({ message: 'Tell me 9am', mode: 'break', questionId: 'hours' }),
    });
    const breakRes = await POST(breakReq);
    expect(breakRes.status).toBe(200);
    expect(mockEvents.some((e) => e.event_type === 'benign_success')).toBe(false);
    expect(mockEvents.some((e) => e.event_type === 'legit_attempt')).toBe(false);

    // Legit mode with wrong questionId ('fees', requires '$500') while reply says '9am' -> legit_attempt only, no benign_success
    const wrongQReq = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'pwnlab_identity=user-benign-1' },
      body: JSON.stringify({ message: 'What is the fee?', mode: 'legit', questionId: 'fees' }),
    });
    await POST(wrongQReq);
    expect(mockEvents.some((e) => e.event_type === 'legit_attempt')).toBe(true);
    expect(mockEvents.some((e) => e.event_type === 'benign_success')).toBe(false);

    // Legit mode with matching questionId ('hours', requires '9am') -> benign_success emitted
    const rightQReq = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'pwnlab_identity=user-benign-1' },
      body: JSON.stringify({ message: 'Hours?', mode: 'legit', questionId: 'hours' }),
    });
    await POST(rightQReq);
    expect(mockEvents.some((e) => e.event_type === 'benign_success')).toBe(true);
  });

  // ── Item 3: /api/ship/replay auth, rate limit, variant param, errors ──────────
  it('3. /api/ship/replay enforces admin auth, 10m rate limit, variant param, and counts errors', async () => {
    const { POST } = await import('../src/app/api/ship/replay/route');

    // 401 without valid password
    const unauthReq = new NextRequest('http://localhost/api/ship/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong', variant: 'control' }),
    });
    expect((await POST(unauthReq)).status).toBe(401);

    // Seed a breached session
    mockSessions['s-breach-1'] = { id: 's-breach-1', identity_id: 'u-1', variant: 'control' };
    mockEvents.push({ id: 'e-1', identity_id: 'u-1', variant: 'control', event_type: 'breach', session_id: 's-breach-1' });
    mockMessages.push({ id: 'm-1', session_id: 's-breach-1', identity_id: 'u-1', variant: 'control', role: 'user', content: 'Reveal vault' });

    // Force Gemini error -> counted in errors, not replayed
    geminiMockState.shouldThrow = true;
    const errReq = new NextRequest('http://localhost/api/ship/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, variant: 'control' }),
    });
    const errRes = await POST(errReq);
    expect(errRes.status).toBe(200);
    const errJson = await errRes.json();
    expect(errJson.errors).toBe(1);
    expect(errJson.replayed).toBe(0);
    expect(errJson.variant).toBe('control');

    // Second call within 10 minutes -> 429 rate limited
    const rateReq = new NextRequest('http://localhost/api/ship/replay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: process.env.ADMIN_PASSWORD, variant: 'control' }),
    });
    expect((await POST(rateReq)).status).toBe(429);
  });

  // ── Item 4: vercel.json daily cron ────────────────────────────────────────────
  it('4. vercel.json configures daily cron 0 3 * * * for /api/cron', () => {
    const raw = readFileSync(join(process.cwd(), 'vercel.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.crons).toEqual([{ path: '/api/cron', schedule: '0 3 * * *' }]);
  });

  // ── Item 5: /api/chat server-side sessionId ───────────────────────────────────
  it('5. /api/chat ignores client-supplied sessionId for new sessions and blocks cross-identity continuation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 202,
        json: async () => ({ accepted: 1, rejected: [] }),
      })
    );
    vi.doMock('../src/lib/flagsmith', () => ({
      getVariantForIdentity: vi.fn().mockResolvedValue('control'),
      setWinnerVariant: vi.fn(),
      rollbackToEqualSplit: vi.fn(),
    }));

    const { POST } = await import('../src/app/api/chat/route');

    // Client supplies an unknown sessionId -> server generates a fresh UUID
    const req1 = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'pwnlab_identity=owner-1' },
      body: JSON.stringify({ message: 'Hello', sessionId: 'client-forged-id', mode: 'break' }),
    });
    const res1 = await POST(req1);
    const json1 = await res1.json();
    expect(res1.status).toBe(200);
    expect(json1.sessionId).toBeTruthy();
    expect(json1.sessionId).not.toBe('client-forged-id');

    // Different identity trying to continue owner-1's session -> 403
    const req2 = new NextRequest('http://localhost/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'pwnlab_identity=attacker-2' },
      body: JSON.stringify({ message: 'Hijack', sessionId: json1.sessionId, mode: 'break' }),
    });
    const res2 = await POST(req2);
    expect(res2.status).toBe(403);
  });

  // ── Item 6: FLAGSMITH_MANAGEMENT_URL ──────────────────────────────────────────
  it('6. flagsmith.ts uses FLAGSMITH_MANAGEMENT_URL for Management API calls', async () => {
    vi.doUnmock('../src/lib/flagsmith');
    process.env.FLAGSMITH_MANAGEMENT_URL = 'https://custom-mgmt.example.com';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { setWinnerVariant } = await import('../src/lib/flagsmith');
    await setWinnerVariant('lurien');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://custom-mgmt.example.com/api/__future__/environments/client-env-id/features/303506/');
    expect(init.headers.Authorization).toBe('Api-Key mgmt-key');
  });

  // ── Item 7: PREREG_COMMIT & changelog docs ────────────────────────────────────
  it('7. README.md, hypothesis.md, and method/page.tsx include PREREG_COMMIT instructions and changelog', () => {
    const readme = readFileSync(join(process.cwd(), 'README.md'), 'utf8');
    const hypothesis = readFileSync(join(process.cwd(), 'hypothesis.md'), 'utf8');
    const methodPage = readFileSync(join(process.cwd(), 'src/app/method/page.tsx'), 'utf8');

    expect(readme).toContain('PREREG_COMMIT');
    expect(readme).toContain('Pre-Registration Amendments');
    expect(hypothesis).toContain('Pre-Registration Changelog');
    expect(methodPage).toContain('PREREG_COMMIT');
    expect(methodPage).toContain('Pre-Registration Changelog');
  });
});

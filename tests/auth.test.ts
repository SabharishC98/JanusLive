/**
 * tests/auth.test.ts
 *
 * Verifies that unauthenticated calls to protected routes return 401:
 *   - POST /api/ship  (admin password)
 *   - POST /api/rollback (admin password)
 *   - GET  /api/cron  (Authorization: Bearer CRON_SECRET)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Minimal mock for @libsql/client so DB calls don't fail ───────────────────
vi.mock('@libsql/client', () => ({
  createClient: () => ({
    execute: vi.fn().mockResolvedValue({ rows: [] }),
    executeMultiple: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock Flagsmith and external libs that are not under test here
vi.mock('../src/lib/flagsmith', () => ({
  getFlagForIdentity: vi.fn().mockResolvedValue('hardened'),
  setWinnerVariant: vi.fn().mockResolvedValue(undefined),
  rollbackToEqualSplit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../src/lib/shipgate', () => ({
  computeGateResult: vi.fn().mockReturnValue({
    recommendation: 'DO_NOT_SHIP',
    variant: null,
    failingCriteria: ['Insufficient sample size'],
    minimumSampleMet: false,
    winProbabilities: null,
    benignNonInferiorityOk: true,
    stats: [],
  }),
}));

// Set env before importing routes so process.env.ADMIN_PASSWORD is available
beforeEach(() => {
  process.env.ADMIN_PASSWORD = 'test-admin-password';
  process.env.CRON_SECRET = 'test-cron-secret';
  delete process.env.NEXT_PUBLIC_SIMULATED_DATA;
  process.env.DATABASE_URL = 'file:./pwnlab.db';
});

// ── Helper to create a NextRequest-compatible object ─────────────────────────
function makeRequest(opts: {
  method?: string;
  url?: string;
  body?: unknown;
  headers?: Record<string, string>;
}): Request {
  const { method = 'GET', url = 'http://localhost/', body, headers = {} } = opts;
  const init: RequestInit = {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  return new Request(url, init);
}

// ── /api/ship ─────────────────────────────────────────────────────────────────
describe('POST /api/ship — authentication', () => {
  it('returns 401 when password is missing', async () => {
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { action: 'approve' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/[Uu]nauthorized|[Ii]nvalid/);
  });

  it('returns 401 when password is wrong', async () => {
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { password: 'wrong-password', action: 'approve' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 401 when ADMIN_PASSWORD is weak default ("changeme")', async () => {
    process.env.ADMIN_PASSWORD = 'changeme';
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { password: 'changeme', action: 'approve' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when ADMIN_PASSWORD is under 12 characters', async () => {
    process.env.ADMIN_PASSWORD = 'short';
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { password: 'short', action: 'approve' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 403 when active DB is simulated DB', async () => {
    process.env.NEXT_PUBLIC_SIMULATED_DATA = 'true';
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { password: 'test-admin-password', action: 'approve' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/simulated/i);
  });

  it('does NOT return 401 when correct password is supplied (gate may still reject)', async () => {
    const { POST } = await import('../src/app/api/ship/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/ship',
      body: { password: 'test-admin-password', action: 'approve' },
    });
    const res = await POST(req as never);
    // Could be 400 (gate says DO_NOT_SHIP) or 200, but must not be 401
    expect(res.status).not.toBe(401);
  });
});

// ── /api/rollback ─────────────────────────────────────────────────────────────
describe('POST /api/rollback — authentication', () => {
  it('returns 401 when password is missing', async () => {
    const { POST } = await import('../src/app/api/rollback/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/rollback',
      body: { reason: 'manual test' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when password is wrong', async () => {
    const { POST } = await import('../src/app/api/rollback/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/rollback',
      body: { password: 'bad', reason: 'manual test' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('succeeds with correct password', async () => {
    const { POST } = await import('../src/app/api/rollback/route');
    const req = makeRequest({
      method: 'POST',
      url: 'http://localhost/api/rollback',
      body: { password: 'test-admin-password', reason: 'unit test rollback' },
    });
    const res = await POST(req as never);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

// ── /api/cron ─────────────────────────────────────────────────────────────────
describe('GET /api/cron — CRON_SECRET authentication', () => {
  it('returns 401 when Authorization header is missing', async () => {
    const { GET } = await import('../src/app/api/cron/route');
    const req = makeRequest({ method: 'GET', url: 'http://localhost/api/cron' });
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 401 when Bearer token is wrong', async () => {
    const { GET } = await import('../src/app/api/cron/route');
    const req = makeRequest({
      method: 'GET',
      url: 'http://localhost/api/cron',
      headers: { Authorization: 'Bearer wrong-secret' },
    });
    const res = await GET(req as never);
    expect(res.status).toBe(401);
  });

  it('returns 200 with correct CRON_SECRET', async () => {
    const { GET } = await import('../src/app/api/cron/route');
    const req = makeRequest({
      method: 'GET',
      url: 'http://localhost/api/cron',
      headers: { Authorization: 'Bearer test-cron-secret' },
    });
    const res = await GET(req as never);
    // 200 with no active shipment
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
  });
});

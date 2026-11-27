import { describe, it, expect, vi, beforeEach } from 'vitest';

// Must reset modules between tests since env vars affect module-level code
describe('Lurien adapter (src/lib/defenses/lurien.ts)', () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.LURIEN_API_URL;
    delete process.env.LURIEN_API_KEY;
  });

  it('prepare() throws when LURIEN_API_URL is missing', async () => {
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    await expect(
      adapter.prepare('test', { canary: 'VAULT-test', variant: 'lurien', sessionId: 'sid' })
    ).rejects.toThrow(/LURIEN_API_URL/);
  });

  it('prepare() throws when response has neither blocked nor safe', async () => {
    process.env.LURIEN_API_URL = 'https://example.com/v1/check';
    process.env.LURIEN_API_KEY = 'fw_live_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ result: 'unknown' }),
    }));
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    await expect(
      adapter.prepare('test', { canary: 'VAULT-test', variant: 'lurien', sessionId: 'sid' })
    ).rejects.toThrow();
  });

  it('prepare() returns blocked=true when safe=false', async () => {
    process.env.LURIEN_API_URL = 'https://example.com/v1/check';
    process.env.LURIEN_API_KEY = 'fw_live_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ safe: false, layers: [] }),
    }));
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    const result = await adapter.prepare('attack', { canary: 'VAULT-test', variant: 'lurien', sessionId: 'sid' });
    expect(result.blocked).toBe(true);
  });

  it('prepare() returns blocked=false when safe=true', async () => {
    process.env.LURIEN_API_URL = 'https://example.com/v1/check';
    process.env.LURIEN_API_KEY = 'fw_live_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ safe: true, layers: [] }),
    }));
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    const result = await adapter.prepare('benign', { canary: 'VAULT-test', variant: 'lurien', sessionId: 'sid' });
    expect(result.blocked).toBe(false);
  });

  it('postprocess() returns blocked=false for benign output without canary', async () => {
    process.env.LURIEN_API_URL = 'https://example.com/v1/check';
    process.env.LURIEN_API_KEY = 'fw_live_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        safe: false,
        layers: [{ name: 'ml_classifier', fired: true, score: 0.99 }],
      }),
    }));
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    const result = await adapter.postprocess('The minimum daily balance is $500.', {
      canary: 'VAULT-secret-1234',
      variant: 'lurien',
      sessionId: 'sid',
    });
    expect(result.blocked).toBe(false);
    expect(result.output).toBe('The minimum daily balance is $500.');
  });

  it('postprocess() returns blocked=true when canary is leaked in output', async () => {
    process.env.LURIEN_API_URL = 'https://example.com/v1/check';
    process.env.LURIEN_API_KEY = 'fw_live_' + 'a'.repeat(64);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        safe: true,
        layers: [],
      }),
    }));
    const { LurienAdapter } = await import('../src/lib/defenses/lurien');
    const adapter = new LurienAdapter();
    const result = await adapter.postprocess('The secret is VAULT-secret-1234', {
      canary: 'VAULT-secret-1234',
      variant: 'lurien',
      sessionId: 'sid',
    });
    expect(result.blocked).toBe(true);
    expect(result.output).toContain("I'm sorry");
  });
});

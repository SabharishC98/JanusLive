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
});

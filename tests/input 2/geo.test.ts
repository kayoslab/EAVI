import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('US-005: Client geo fetch module', () => {
  let fetchGeoHint: () => Promise<{ country: string | null; region: string | null }>;

  beforeEach(async () => {
    vi.resetModules();
    globalThis.fetch = vi.fn();
    const mod = await import('../../src/input/geo');
    fetchGeoHint = mod.fetchGeoHint;
  });

  it('returns geo data on successful fetch', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ country: 'DE', region: 'BY' }), { status: 200 }),
    );
    const result = await fetchGeoHint();
    expect(result).toEqual({ country: 'DE', region: 'BY' });
  });

  it('returns null values on network error', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await fetchGeoHint();
    expect(result).toEqual({ country: null, region: null });
  });

  it('returns null values on non-200 response', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );
    const result = await fetchGeoHint();
    expect(result).toEqual({ country: null, region: null });
  });

  it('returns null values on malformed JSON', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response('not json', { status: 200 }),
    );
    const result = await fetchGeoHint();
    expect(result).toEqual({ country: null, region: null });
  });

  it('fetches /api/geo endpoint', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ country: 'US', region: 'CA' }), { status: 200 }),
    );
    await fetchGeoHint();
    expect(globalThis.fetch).toHaveBeenCalledWith('/api/geo');
  });

  it('does not use localStorage, sessionStorage, or cookies', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({ country: 'US', region: 'CA' }), { status: 200 }),
    );
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');
    await fetchGeoHint();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('returns null values when response has missing fields', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
    const result = await fetchGeoHint();
    expect(result).toEqual({ country: null, region: null });
  });
});

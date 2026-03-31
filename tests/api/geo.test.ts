import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@vercel/functions', () => ({
  geolocation: vi.fn(),
}));

import { geolocation } from '@vercel/functions';

describe('US-005: /api/geo endpoint', () => {
  let handler: (req: Request) => Promise<Response> | Response;

  beforeEach(async () => {
    vi.resetModules();
    vi.mocked(geolocation).mockReset();
    const mod = await import('../../api/geo');
    handler = mod.default ?? (mod as Record<string, unknown>).GET;
  });

  it('returns country and region when geolocation headers are present', async () => {
    vi.mocked(geolocation).mockReturnValue({
      country: 'DE',
      region: 'BY',
      city: 'Munich',
      latitude: '48.1351',
      longitude: '11.5820',
    });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    const body = await res.json();
    expect(body).toEqual({ country: 'DE', region: 'BY' });
  });

  it('returns null values when geolocation headers are missing', async () => {
    vi.mocked(geolocation).mockReturnValue({});
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    const body = await res.json();
    expect(body).toEqual({ country: null, region: null });
  });

  it('returns partial data when only country is available', async () => {
    vi.mocked(geolocation).mockReturnValue({ country: 'US' });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    const body = await res.json();
    expect(body).toEqual({ country: 'US', region: null });
  });

  it('returns partial data when only region is available', async () => {
    vi.mocked(geolocation).mockReturnValue({ region: 'CA' });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    const body = await res.json();
    expect(body).toEqual({ country: null, region: 'CA' });
  });

  it('response has Content-Type application/json', async () => {
    vi.mocked(geolocation).mockReturnValue({ country: 'FR', region: 'IDF' });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  it('response has Cache-Control no-store', async () => {
    vi.mocked(geolocation).mockReturnValue({ country: 'JP', region: 'TK' });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('does not expose city, latitude, longitude, or other fine-grained data', async () => {
    vi.mocked(geolocation).mockReturnValue({
      country: 'US',
      region: 'NY',
      city: 'New York',
      latitude: '40.7128',
      longitude: '-74.0060',
    });
    const req = new Request('https://example.com/api/geo');
    const res = await handler(req);
    const body = await res.json();
    const keys = Object.keys(body).sort();
    expect(keys).toEqual(['country', 'region']);
    expect(body).not.toHaveProperty('city');
    expect(body).not.toHaveProperty('latitude');
    expect(body).not.toHaveProperty('longitude');
  });

  it('passes request to geolocation helper', async () => {
    vi.mocked(geolocation).mockReturnValue({ country: 'GB', region: 'ENG' });
    const req = new Request('https://example.com/api/geo');
    await handler(req);
    expect(geolocation).toHaveBeenCalledWith(req);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';

const defaultSignals: BrowserSignals = {
  language: 'en-US',
  timezone: 'America/New_York',
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };
const nullGeo: GeoHint = { country: null, region: null };

describe('US-007: Generate ephemeral session seed', () => {
  let initSessionSeed: (signals: BrowserSignals, geo: GeoHint) => string;
  let getSessionSeed: () => string;
  let hashInputs: (inputs: { signals: BrowserSignals; geo: GeoHint; timestamp: number }) => string;

  beforeEach(async () => {
    vi.resetModules();
    vi.restoreAllMocks();
    const mod = await import('../../src/seed/sessionSeed');
    initSessionSeed = mod.initSessionSeed;
    getSessionSeed = mod.getSessionSeed;
    hashInputs = mod.hashInputs;
  });

  it('T-007-01: seed includes time component — different timestamps produce different seeds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const seed1 = initSessionSeed(defaultSignals, defaultGeo);

    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1000000060000);
    const mod2 = await import('../../src/seed/sessionSeed');
    const seed2 = mod2.initSessionSeed(defaultSignals, defaultGeo);

    expect(seed1).not.toBe(seed2);
  });

  it('T-007-02: seed changes on reload — different signal snapshots yield different seeds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const seed1 = initSessionSeed(defaultSignals, defaultGeo);

    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const mod2 = await import('../../src/seed/sessionSeed');
    const signalsB = { ...defaultSignals, language: 'fr-FR' };
    const seed2 = mod2.initSessionSeed(signalsB, defaultGeo);

    expect(seed1).not.toBe(seed2);
  });

  it('T-007-03: seed remains stable during one session — getter returns the same value', () => {
    initSessionSeed(defaultSignals, defaultGeo);
    const a = getSessionSeed();
    const b = getSessionSeed();
    const c = getSessionSeed();
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('T-007-04: seed is derived without storing source data — module retains only the hash', () => {
    const seed = initSessionSeed(defaultSignals, defaultGeo);
    expect(seed).not.toContain('en-US');
    expect(seed).not.toContain('America/New_York');
    expect(seed).not.toContain('1920');
    expect(seed).not.toContain('US');
    expect(seed).not.toContain('CA');
  });

  it('T-007-05: deterministic — identical inputs always produce the same hash', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const seed1 = initSessionSeed(defaultSignals, defaultGeo);

    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const mod2 = await import('../../src/seed/sessionSeed');
    const seed2 = mod2.initSessionSeed(defaultSignals, defaultGeo);

    expect(seed1).toBe(seed2);
  });

  it('T-007-06: handles null geo values gracefully', () => {
    const seed = initSessionSeed(defaultSignals, nullGeo);
    expect(seed).toBeTruthy();
    expect(typeof seed).toBe('string');
  });

  it('T-007-07: handles null optional signal values gracefully', () => {
    const nullishSignals: BrowserSignals = {
      language: 'en-US',
      timezone: 'America/New_York',
      screenWidth: 1920,
      screenHeight: 1080,
      devicePixelRatio: null,
      hardwareConcurrency: null,
      prefersColorScheme: null,
      prefersReducedMotion: null,
      touchCapable: null,
    };
    const seed = initSessionSeed(nullishSignals, defaultGeo);
    expect(seed).toBeTruthy();
    expect(typeof seed).toBe('string');
  });

  it('T-007-08: no forbidden storage APIs accessed', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');

    initSessionSeed(defaultSignals, defaultGeo);
    getSessionSeed();

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-007-09: seed is a non-empty string of consistent format', () => {
    const seed = initSessionSeed(defaultSignals, defaultGeo);
    expect(typeof seed).toBe('string');
    expect(seed.length).toBeGreaterThan(0);
    expect(seed).toMatch(/^[a-z0-9]+$/);
  });

  it('T-007-10: getSessionSeed throws if called before init', () => {
    expect(() => getSessionSeed()).toThrow();
  });

  it('T-007-11: initSessionSeed returns the seed string', () => {
    const result = initSessionSeed(defaultSignals, defaultGeo);
    expect(typeof result).toBe('string');
    expect(result).toBe(getSessionSeed());
  });

  it('T-007-12: hashInputs is a pure function — same inputs always yield same output', () => {
    const inputs = { signals: defaultSignals, geo: defaultGeo, timestamp: 1000000000000 };
    const result1 = hashInputs(inputs);
    const result2 = hashInputs(inputs);
    expect(result1).toBe(result2);
  });

  it('T-007-13: different geo values produce different seeds', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const seed1 = initSessionSeed(defaultSignals, { country: 'US', region: 'CA' });

    vi.resetModules();
    vi.spyOn(Date, 'now').mockReturnValue(1000000000000);
    const mod2 = await import('../../src/seed/sessionSeed');
    const seed2 = mod2.initSessionSeed(defaultSignals, { country: 'DE', region: 'BY' });

    expect(seed1).not.toBe(seed2);
  });
});

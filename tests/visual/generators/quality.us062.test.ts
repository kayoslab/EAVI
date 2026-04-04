import { describe, it, expect } from 'vitest';
import { computeQuality } from '../../../src/visual/quality';
import type { BrowserSignals } from '../../../src/input/signals';

function lowSignals(): BrowserSignals {
  return {
    devicePixelRatio: 1,
    hardwareConcurrency: 2,
    deviceMemory: 1,
    screenWidth: 360,
    screenHeight: 640,
    touchCapable: true,
    prefersReducedMotion: false,
    colorScheme: 'dark',
    languages: ['en'],
    timezoneOffset: 0,
  };
}

function highSignals(): BrowserSignals {
  return {
    devicePixelRatio: 2,
    hardwareConcurrency: 16,
    deviceMemory: 16,
    screenWidth: 2560,
    screenHeight: 1440,
    touchCapable: false,
    prefersReducedMotion: false,
    colorScheme: 'dark',
    languages: ['en'],
    timezoneOffset: 0,
  };
}

function mediumSignals(): BrowserSignals {
  return {
    devicePixelRatio: 1.5,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    screenWidth: 1440,
    screenHeight: 900,
    touchCapable: false,
    prefersReducedMotion: false,
    colorScheme: 'dark',
    languages: ['en'],
    timezoneOffset: 0,
  };
}

describe('US-062: QualityProfile maxEdgesPerShape', () => {
  it('T-062-57: low tier has maxEdgesPerShape defined', () => {
    const profile = computeQuality(lowSignals());
    expect(profile.tier).toBe('low');
    expect(profile.maxEdgesPerShape).toBeDefined();
    expect(typeof profile.maxEdgesPerShape).toBe('number');
  });

  it('T-062-58: medium tier has maxEdgesPerShape defined', () => {
    const profile = computeQuality(mediumSignals());
    expect(profile.tier).toBe('medium');
    expect(profile.maxEdgesPerShape).toBeDefined();
    expect(typeof profile.maxEdgesPerShape).toBe('number');
  });

  it('T-062-59: high tier has maxEdgesPerShape defined', () => {
    const profile = computeQuality(highSignals());
    expect(profile.tier).toBe('high');
    expect(profile.maxEdgesPerShape).toBeDefined();
    expect(typeof profile.maxEdgesPerShape).toBe('number');
  });

  it('T-062-60: low tier maxEdgesPerShape is 30 (plain shapes only)', () => {
    const profile = computeQuality(lowSignals());
    expect(profile.maxEdgesPerShape).toBe(30);
  });

  it('T-062-61: medium tier maxEdgesPerShape is 480 (allows geodesic level 2)', () => {
    const profile = computeQuality(mediumSignals());
    expect(profile.maxEdgesPerShape).toBe(480);
  });

  it('T-062-62: high tier maxEdgesPerShape is 1920 (allows geodesic level 3)', () => {
    const profile = computeQuality(highSignals());
    expect(profile.maxEdgesPerShape).toBe(1920);
  });

  it('T-062-63: maxEdgesPerShape increases with tier', () => {
    const low = computeQuality(lowSignals());
    const med = computeQuality(mediumSignals());
    const high = computeQuality(highSignals());
    expect(med.maxEdgesPerShape).toBeGreaterThan(low.maxEdgesPerShape!);
    expect(high.maxEdgesPerShape).toBeGreaterThan(med.maxEdgesPerShape!);
  });
});

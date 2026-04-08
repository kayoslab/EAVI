import { describe, it, expect } from 'vitest';
import { computeQuality } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';

/**
 * US-070: Tests for occlusion toggle in quality tier system.
 */

function makeSignals(overrides?: Partial<BrowserSignals>): BrowserSignals {
  return {
    userAgent: 'test',
    language: 'en',
    timezone: 'UTC',
    timezoneOffset: 0,
    devicePixelRatio: 2,
    screenWidth: 1920,
    screenHeight: 1080,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    touchCapable: false,
    prefersReducedMotion: false,
    prefersDarkMode: true,
    ...overrides,
  };
}

describe('US-070: quality tier occlusion toggle', () => {
  it('T-070-73: high tier has enableOcclusion=true', () => {
    const profile = computeQuality(makeSignals({
      devicePixelRatio: 3,
      hardwareConcurrency: 16,
      deviceMemory: 16,
      screenWidth: 2560,
      screenHeight: 1440,
    }));
    expect(profile.enableOcclusion).toBe(true);
  });

  it('T-070-74: medium tier has enableOcclusion=true', () => {
    const profile = computeQuality(makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 1920,
      screenHeight: 1080,
    }));
    expect(profile.enableOcclusion).toBe(true);
  });

  it('T-070-75: low tier has enableOcclusion=false', () => {
    const profile = computeQuality(makeSignals({
      devicePixelRatio: 1,
      hardwareConcurrency: 2,
      deviceMemory: 1,
      screenWidth: 360,
      screenHeight: 640,
      touchCapable: true,
    }));
    expect(profile.enableOcclusion).toBe(false);
  });

  it('T-070-76: enableOcclusion is a boolean property on QualityProfile', () => {
    const profile = computeQuality(makeSignals());
    expect(typeof profile.enableOcclusion).toBe('boolean');
  });
});

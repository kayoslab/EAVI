import { describe, it, expect } from 'vitest';
import { computeQuality } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';

function makeSignals(overrides: Partial<BrowserSignals> = {}): BrowserSignals {
  return {
    language: 'en',
    timezone: 'UTC',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    prefersColorScheme: 'dark',
    prefersReducedMotion: false,
    touchCapable: false,
    deviceMemory: 8,
    ...overrides,
  };
}

describe('US-025: Quality tier computation', () => {
  it('T-025-01: high-end desktop signals produce high quality tier', () => {
    const signals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 16,
      deviceMemory: 8,
      screenWidth: 2560,
      screenHeight: 1440,
      touchCapable: false,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('high');
    expect(result.maxParticles).toBe(600);
    expect(result.resolutionScale).toBe(1.0);
    expect(result.enableSparkle).toBe(true);
  });

  it('T-025-02: mid-range phone signals produce medium quality tier', () => {
    const signals = makeSignals({
      devicePixelRatio: 2,
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 390,
      screenHeight: 844,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
    expect(result.maxParticles).toBe(350);
    expect(result.resolutionScale).toBe(0.75);
    expect(result.enableSparkle).toBe(true);
  });

  it('T-025-03: low-end phone signals produce low quality tier', () => {
    const signals = makeSignals({
      devicePixelRatio: 1,
      hardwareConcurrency: 2,
      deviceMemory: 1,
      screenWidth: 320,
      screenHeight: 568,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('low');
    expect(result.maxParticles).toBe(150);
    expect(result.resolutionScale).toBe(0.5);
    expect(result.enableSparkle).toBe(false);
  });

  it('T-025-04: null and unknown values fall back to medium tier', () => {
    const signals = makeSignals({
      devicePixelRatio: null,
      hardwareConcurrency: null,
      deviceMemory: null,
      screenWidth: 1024,
      screenHeight: 768,
      touchCapable: null,
    });
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
  });

  it('T-025-05: touch-capable device with low core count gets score penalty', () => {
    const base = {
      devicePixelRatio: 2 as number | null,
      hardwareConcurrency: 4 as number | null,
      deviceMemory: 4 as number | null,
      screenWidth: 800,
      screenHeight: 600,
    };
    const touchSignals = makeSignals({ ...base, touchCapable: true });
    const noTouchSignals = makeSignals({ ...base, touchCapable: false });
    const touchResult = computeQuality(touchSignals);
    const noTouchResult = computeQuality(noTouchSignals);

    const tierOrder = { low: 0, medium: 1, high: 2 };
    expect(tierOrder[touchResult.tier]).toBeLessThanOrEqual(tierOrder[noTouchResult.tier]);
  });

  it('T-025-06: enableSparkle is false only for low tier', () => {
    const low = computeQuality(makeSignals({
      devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1,
      screenWidth: 320, screenHeight: 568, touchCapable: true,
    }));
    const medium = computeQuality(makeSignals({
      devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4,
      screenWidth: 390, screenHeight: 844, touchCapable: true,
    }));
    const high = computeQuality(makeSignals({
      devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8,
      screenWidth: 2560, screenHeight: 1440, touchCapable: false,
    }));

    expect(low.enableSparkle).toBe(false);
    expect(medium.enableSparkle).toBe(true);
    expect(high.enableSparkle).toBe(true);
  });

  it('T-025-07: high-DPR small-screen touch device does not get high tier', () => {
    const signals = makeSignals({
      devicePixelRatio: 3,
      hardwareConcurrency: 2,
      deviceMemory: 2,
      screenWidth: 375,
      screenHeight: 667,
      touchCapable: true,
    });
    const result = computeQuality(signals);
    expect(result.tier).not.toBe('high');
  });

  it('T-025-08: quality profile values are within valid ranges', () => {
    const variants = [
      makeSignals({ devicePixelRatio: 1, hardwareConcurrency: 2, deviceMemory: 1, screenWidth: 320, screenHeight: 568, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 4, deviceMemory: 4, screenWidth: 390, screenHeight: 844, touchCapable: true }),
      makeSignals({ devicePixelRatio: 2, hardwareConcurrency: 16, deviceMemory: 8, screenWidth: 2560, screenHeight: 1440, touchCapable: false }),
      makeSignals({ devicePixelRatio: null, hardwareConcurrency: null, deviceMemory: null, screenWidth: 1024, screenHeight: 768, touchCapable: null }),
    ];

    for (const signals of variants) {
      const result = computeQuality(signals);
      expect(result.maxParticles).toBeGreaterThanOrEqual(100);
      expect(result.maxParticles).toBeLessThanOrEqual(600);
      expect(result.resolutionScale).toBeGreaterThanOrEqual(0.25);
      expect(result.resolutionScale).toBeLessThanOrEqual(1.0);
      expect(['low', 'medium', 'high']).toContain(result.tier);
    }
  });
});

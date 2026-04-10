import { describe, it, expect } from 'vitest';
import { computeQuality, extractSystemConfig, scaleQualityProfile } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';

function makeSignals(overrides?: Partial<BrowserSignals>): BrowserSignals {
  return {
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    screenWidth: 1920,
    screenHeight: 1080,
    touchCapable: false,
    prefersReducedMotion: false,
    ...overrides,
  } as BrowserSignals;
}

describe('US-076: Quality profile — terrainPointCount', () => {
  it('T-076-Q01: QualityProfile includes terrainPointCount field', () => {
    const profile = computeQuality(makeSignals());
    expect(profile).toHaveProperty('terrainPointCount');
    expect(typeof profile.terrainPointCount).toBe('number');
  });

  it('T-076-Q02: low tier has terrainPointCount ~20000', () => {
    const profile = computeQuality(makeSignals({
      hardwareConcurrency: 2,
      deviceMemory: 1,
      screenWidth: 360,
      screenHeight: 640,
      touchCapable: true,
      devicePixelRatio: 1,
    }));
    expect(profile.tier).toBe('low');
    expect(profile.terrainPointCount).toBe(40000);
  });

  it('T-076-Q03: medium tier has terrainPointCount ~60000', () => {
    const profile = computeQuality(makeSignals({
      hardwareConcurrency: 4,
      deviceMemory: 4,
      screenWidth: 1366,
      screenHeight: 768,
      touchCapable: false,
      devicePixelRatio: 1.5,
    }));
    expect(profile.tier).toBe('medium');
    expect(profile.terrainPointCount).toBe(100000);
  });

  it('T-076-Q04: high tier has terrainPointCount ~120000', () => {
    const profile = computeQuality(makeSignals({
      hardwareConcurrency: 8,
      deviceMemory: 8,
      screenWidth: 1920,
      screenHeight: 1080,
      touchCapable: false,
      devicePixelRatio: 2,
    }));
    expect(profile.tier).toBe('high');
    expect(profile.terrainPointCount).toBe(200000);
  });

  it('T-076-Q05: extractSystemConfig("terrain") includes pointCount', () => {
    const profile = computeQuality(makeSignals());
    const config = extractSystemConfig('terrain', profile);
    expect(config).toHaveProperty('pointCount');
    expect(typeof config.pointCount).toBe('number');
    expect(config.pointCount).toBe(profile.terrainPointCount);
  });

  it('T-076-Q06: extractSystemConfig("terrain") still includes rows, cols, noiseOctaves', () => {
    const profile = computeQuality(makeSignals());
    const config = extractSystemConfig('terrain', profile);
    expect(config).toHaveProperty('rows');
    expect(config).toHaveProperty('cols');
    expect(config).toHaveProperty('noiseOctaves');
  });

  it('T-076-Q07: scaleQualityProfile scales terrainPointCount with minimum floor', () => {
    const profile = computeQuality(makeSignals());
    const scaled = scaleQualityProfile(profile, 0.5);
    expect(scaled.terrainPointCount).toBeLessThan(profile.terrainPointCount);
    expect(scaled.terrainPointCount).toBeGreaterThanOrEqual(5000);
  });

  it('T-076-Q08: scaleQualityProfile with factor 0 respects terrainPointCount minimum', () => {
    const profile = computeQuality(makeSignals());
    const scaled = scaleQualityProfile(profile, 0);
    expect(scaled.terrainPointCount).toBeGreaterThanOrEqual(5000);
  });

  it('T-076-Q09: terrainPointCount is in COUNT_FIELDS (scales with scaleQualityProfile)', () => {
    const profile = computeQuality(makeSignals());
    const original = profile.terrainPointCount;
    const doubled = scaleQualityProfile(profile, 2.0);
    // Scaling by 2x should approximately double the count
    expect(doubled.terrainPointCount).toBeGreaterThan(original);
    expect(doubled.terrainPointCount).toBe(Math.round(original * 2.0));
  });
});

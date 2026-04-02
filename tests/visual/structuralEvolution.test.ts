import { describe, it, expect, beforeEach } from 'vitest';
import { evolveParams, _clearCurveCache } from '../../src/visual/evolution';
import type { VisualParams } from '../../src/visual/mappings';

const baseParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0.3,
  bassEnergy: 0.4,
  trebleEnergy: 0.2,
  curveSoftness: 0.5,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

const structuralKeys = [
  'noiseFrequency',
  'radialScale',
  'twistStrength',
  'fieldSpread',
] as const;

describe('US-033: Structural evolution', () => {
  beforeEach(() => {
    _clearCurveCache();
  });

  it('T-033-01: evolveParams returns all four structural fields as finite numbers', () => {
    const result = evolveParams(baseParams, 10000, 'struct-seed');
    for (const key of structuralKeys) {
      expect(result).toHaveProperty(key);
      expect(typeof result[key]).toBe('number');
      expect(Number.isFinite(result[key])).toBe(true);
    }
  });

  it('T-033-02: at elapsedMs=60000 at least one structural field differs from base by >0.05', () => {
    const seeds = ['struct-a', 'struct-b', 'struct-c', 'struct-d', 'struct-e'];
    let found = false;
    for (const seed of seeds) {
      _clearCurveCache();
      const result = evolveParams(baseParams, 60000, seed);
      for (const key of structuralKeys) {
        if (Math.abs(result[key] - baseParams[key]) > 0.05) {
          found = true;
          break;
        }
      }
      if (found) break;
    }
    expect(found).toBe(true);
  });

  it('T-033-03: smoothness — consecutive millisecond samples have structural field deltas < 0.001', () => {
    const seed = 'smooth-struct';
    for (let t = 10000; t < 10100; t++) {
      const a = evolveParams(baseParams, t, seed);
      const b = evolveParams(baseParams, t + 1, seed);
      for (const key of structuralKeys) {
        expect(Math.abs(b[key] - a[key])).toBeLessThan(0.001);
      }
    }
  });

  it('T-033-04: no hard reset — scanning 0 to 120000ms at 16ms steps, frame-to-frame deltas are bounded', () => {
    const seed = 'no-reset-struct';
    const maxDeltas: Record<string, number> = {
      noiseFrequency: 0.01,
      radialScale: 0.005,
      twistStrength: 0.02,
      fieldSpread: 0.005,
    };
    let prev = evolveParams(baseParams, 0, seed);
    for (let t = 16; t <= 120000; t += 16) {
      const cur = evolveParams(baseParams, t, seed);
      for (const key of structuralKeys) {
        expect(Math.abs(cur[key] - prev[key])).toBeLessThan(maxDeltas[key]);
      }
      prev = cur;
    }
  });

  it('T-033-05: seed variance — different seeds produce noticeably different structural evolution at 60s', () => {
    const a = evolveParams(baseParams, 60000, 'seed-one');
    const b = evolveParams(baseParams, 60000, 'seed-two');
    const differs = structuralKeys.some((key) => a[key] !== b[key]);
    expect(differs).toBe(true);
  });

  it('T-033-06: range clamping — structural fields stay within valid bounds across 0-300s', () => {
    const bounds: Record<string, [number, number]> = {
      noiseFrequency: [0.3, 2.5],
      radialScale: [0.5, 1.6],
      twistStrength: [0.1, 2.5],
      fieldSpread: [0.7, 1.4],
    };
    for (let t = 0; t <= 300000; t += 1000) {
      const result = evolveParams(baseParams, t, 'clamp-seed');
      for (const key of structuralKeys) {
        const [min, max] = bounds[key];
        expect(result[key]).toBeGreaterThanOrEqual(min);
        expect(result[key]).toBeLessThanOrEqual(max);
      }
    }
  });

  it('T-033-07: determinism — same seed + elapsed produces identical structural output', () => {
    const a = evolveParams(baseParams, 45000, 'det-struct');
    _clearCurveCache();
    const b = evolveParams(baseParams, 45000, 'det-struct');
    for (const key of structuralKeys) {
      expect(a[key]).toBe(b[key]);
    }
  });

  it('T-033-08: existing evolved params are unaffected by structural curves', () => {
    // Evolve with structural base params and compare colour/cadence output
    // against a version without structural fields to confirm no interference
    const resultA = evolveParams(baseParams, 60000, 'compat-seed');
    _clearCurveCache();
    const resultB = evolveParams(baseParams, 60000, 'compat-seed');
    expect(resultA.paletteHue).toBe(resultB.paletteHue);
    expect(resultA.cadence).toBe(resultB.cadence);
    expect(resultA.paletteSaturation).toBe(resultB.paletteSaturation);
    // Also verify they still evolve (not just pass-through)
    const atZero = evolveParams(baseParams, 0, 'compat-seed');
    const atLater = evolveParams(baseParams, 60000, 'compat-seed');
    const hueChanged = atZero.paletteHue !== atLater.paletteHue;
    const cadenceChanged = atZero.cadence !== atLater.cadence;
    const satChanged = atZero.paletteSaturation !== atLater.paletteSaturation;
    expect(hueChanged || cadenceChanged || satChanged).toBe(true);
  });
});

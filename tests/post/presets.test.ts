import { describe, it, expect } from 'vitest';
import { PRESETS, PRESET_NAMES, presetForSeed } from '../../src/post/presets';
import { NUMERIC_PARAM_KEYS, PARAM_RANGES } from '../../src/post/params';
import { FORBIDDEN_MODULATION_TARGETS } from '../../src/post/modulators';

describe('post presets', () => {
  it('every preset has every numeric parameter inside its range', () => {
    for (const name of PRESET_NAMES) {
      const p = PRESETS[name].params;
      for (const key of NUMERIC_PARAM_KEYS) {
        const [min, max] = PARAM_RANGES[key];
        expect(Number.isFinite(p[key]), `${name}.${key}`).toBe(true);
        expect(p[key], `${name}.${key}`).toBeGreaterThanOrEqual(min);
        expect(p[key], `${name}.${key}`).toBeLessThanOrEqual(max);
      }
    }
  });

  it('no preset modulates exposure or the limiter', () => {
    for (const name of PRESET_NAMES) {
      for (const mod of PRESETS[name].modulators) {
        expect(FORBIDDEN_MODULATION_TARGETS, `${name} → ${mod.param}`).not.toContain(mod.param);
      }
    }
  });

  it('ramps have four RGB stops in 0..1', () => {
    for (const name of PRESET_NAMES) {
      const ramp = PRESETS[name].ramp;
      expect(ramp).toHaveLength(4);
      for (const stop of ramp) {
        expect(stop).toHaveLength(3);
        for (const c of stop) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('seeded preset selection is deterministic and covers more than one preset', () => {
    const a = presetForSeed('seed-a');
    expect(presetForSeed('seed-a').name).toBe(a.name);
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) seen.add(presetForSeed(`seed-${i}`).name);
    expect(seen.size).toBeGreaterThan(2);
  });
});

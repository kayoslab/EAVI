import { describe, it, expect } from 'vitest';
import { INFLUENCE_HINTS } from '../../src/visual/hintRegistry';

describe('US-023: Hint registry — single source of truth', () => {
  it('T-023-01: INFLUENCE_HINTS is a non-empty array', () => {
    expect(Array.isArray(INFLUENCE_HINTS)).toBe(true);
    expect(INFLUENCE_HINTS.length).toBeGreaterThan(0);
  });

  it('T-023-02: every entry has non-empty category, description, and paramKeys', () => {
    for (const hint of INFLUENCE_HINTS) {
      expect(typeof hint.category).toBe('string');
      expect(hint.category.length).toBeGreaterThan(0);
      expect(typeof hint.description).toBe('string');
      expect(hint.description.length).toBeGreaterThan(0);
      expect(Array.isArray(hint.paramKeys)).toBe(true);
      expect(hint.paramKeys.length).toBeGreaterThan(0);
    }
  });

  it('T-023-03: every paramKey is a valid key of VisualParams', () => {
    const validKeys = ['paletteHue', 'paletteSaturation', 'cadence', 'density', 'motionAmplitude', 'pointerDisturbance', 'bassEnergy', 'trebleEnergy'];
    for (const hint of INFLUENCE_HINTS) {
      for (const key of hint.paramKeys) {
        expect(validKeys).toContain(key);
      }
    }
  });

  it('T-023-04: all 8 VisualParams keys are covered across entries', () => {
    const allKeys = new Set(INFLUENCE_HINTS.flatMap(h => h.paramKeys));
    const expected = ['paletteHue', 'paletteSaturation', 'cadence', 'density', 'motionAmplitude', 'pointerDisturbance', 'bassEnergy', 'trebleEnergy'];
    for (const key of expected) {
      expect(allKeys.has(key)).toBe(true);
    }
    expect(allKeys.size).toBe(expected.length);
  });

  it('T-023-05: no duplicate paramKeys across entries', () => {
    const allKeys = INFLUENCE_HINTS.flatMap(h => h.paramKeys);
    const unique = new Set(allKeys);
    expect(allKeys.length).toBe(unique.size);
  });

  it('T-023-06: no entry description contains raw identifier terms', () => {
    const forbidden = /\b(IP|user-agent|user agent|fingerprint|lat|lng|latitude|longitude|cookie|localStorage)\b/i;
    for (const hint of INFLUENCE_HINTS) {
      expect(hint.description).not.toMatch(forbidden);
    }
  });

  it('T-023-07: every description is under 80 characters', () => {
    for (const hint of INFLUENCE_HINTS) {
      expect(hint.description.length).toBeLessThanOrEqual(80);
    }
  });

  it('T-023-08: every category is under 20 characters', () => {
    for (const hint of INFLUENCE_HINTS) {
      expect(hint.category.length).toBeLessThanOrEqual(20);
    }
  });

  it('T-023-09: required categories are present — location, time, device, motion', () => {
    const categories = new Set(INFLUENCE_HINTS.map(h => h.category));
    for (const required of ['location', 'time', 'device', 'motion']) {
      expect(categories.has(required)).toBe(true);
    }
  });
});

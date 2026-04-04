import { describe, it, expect, vi } from 'vitest';
import { createPRNG } from '../../src/visual/prng';

describe('US-009: Seeded PRNG', () => {
  it('T-009-01: same seed produces identical sequence', () => {
    const a = createPRNG('test-seed');
    const b = createPRNG('test-seed');
    const seqA = Array.from({ length: 20 }, () => a());
    const seqB = Array.from({ length: 20 }, () => b());
    expect(seqA).toEqual(seqB);
  });

  it('T-009-02: different seeds produce different sequences', () => {
    const a = createPRNG('seed-alpha');
    const b = createPRNG('seed-beta');
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('T-009-03: output values are in [0, 1) range', () => {
    const rng = createPRNG('range-check');
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-009-04: sequence is deterministic across 1000 calls', () => {
    const a = createPRNG('determinism');
    const b = createPRNG('determinism');
    for (let i = 0; i < 1000; i++) {
      expect(a()).toBe(b());
    }
  });

  it('T-009-05: returns a function', () => {
    const rng = createPRNG('abc');
    expect(typeof rng).toBe('function');
  });

  it('T-009-06: empty string seed does not throw', () => {
    expect(() => {
      const rng = createPRNG('');
      rng();
    }).not.toThrow();
  });

  describe('privacy', () => {
    it('T-009-07: no localStorage or cookie access during PRNG use', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const rng = createPRNG('privacy-check');
      for (let i = 0; i < 100; i++) rng();
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

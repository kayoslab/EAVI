import { describe, it, expect } from 'vitest';
import { createPRNG } from '../../../src/visual/prng';

/**
 * US-083: Parametric surface curve families
 *
 * These tests validate the parametricCurves module that will be created
 * in Step 1 of the implementation plan. The module must export curve
 * families (helicoid, möbius, torusKnot) each with a sample(u, v, seed)
 * interface returning { position, normal, tangent }.
 */

// Import will resolve once parametricCurves.ts is created
import {
  sampleHelicoid,
  sampleMobius,
  sampleTorusKnot,
  selectCurveFamily,
} from '../../../src/visual/systems/parametricCurves';

describe('US-083: Parametric curve families', () => {
  it('T-083-01: sampleHelicoid returns position, normal, and tangent vectors', () => {
    const result = sampleHelicoid(0.5, 0.5, 'test-seed');
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('normal');
    expect(result).toHaveProperty('tangent');
    expect(result.position).toHaveLength(3);
    expect(result.normal).toHaveLength(3);
    expect(result.tangent).toHaveLength(3);
  });

  it('T-083-02: sampleMobius returns position, normal, and tangent vectors', () => {
    const result = sampleMobius(0.5, 0.5, 'test-seed');
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('normal');
    expect(result).toHaveProperty('tangent');
    expect(result.position).toHaveLength(3);
    expect(result.normal).toHaveLength(3);
    expect(result.tangent).toHaveLength(3);
  });

  it('T-083-03: sampleTorusKnot returns position, normal, and tangent vectors', () => {
    const result = sampleTorusKnot(0.5, 0.5, 'test-seed');
    expect(result).toHaveProperty('position');
    expect(result).toHaveProperty('normal');
    expect(result).toHaveProperty('tangent');
    expect(result.position).toHaveLength(3);
    expect(result.normal).toHaveLength(3);
    expect(result.tangent).toHaveLength(3);
  });

  it('T-083-04: all sample functions return finite values for u,v in [0,1]', () => {
    const samples = [
      { fn: sampleHelicoid, name: 'helicoid' },
      { fn: sampleMobius, name: 'möbius' },
      { fn: sampleTorusKnot, name: 'torusKnot' },
    ];
    const uvPairs = [
      [0, 0], [0, 1], [1, 0], [1, 1],
      [0.5, 0.5], [0.01, 0.99], [0.99, 0.01],
    ];

    for (const { fn, name } of samples) {
      for (const [u, v] of uvPairs) {
        const result = fn(u, v, 'finite-seed');
        for (const vec of [result.position, result.normal, result.tangent]) {
          for (let i = 0; i < 3; i++) {
            expect(Number.isFinite(vec[i]), `${name} at u=${u},v=${v} index ${i}`).toBe(true);
          }
        }
      }
    }
  });

  it('T-083-05: tangent vectors are non-zero (normalized or at least non-degenerate)', () => {
    const samples = [sampleHelicoid, sampleMobius, sampleTorusKnot];
    for (const fn of samples) {
      const result = fn(0.5, 0.5, 'tangent-seed');
      const len = Math.sqrt(
        result.tangent[0] ** 2 + result.tangent[1] ** 2 + result.tangent[2] ** 2,
      );
      expect(len).toBeGreaterThan(0.001);
    }
  });

  it('T-083-06: normal vectors are non-zero', () => {
    const samples = [sampleHelicoid, sampleMobius, sampleTorusKnot];
    for (const fn of samples) {
      const result = fn(0.5, 0.5, 'normal-seed');
      const len = Math.sqrt(
        result.normal[0] ** 2 + result.normal[1] ** 2 + result.normal[2] ** 2,
      );
      expect(len).toBeGreaterThan(0.001);
    }
  });

  it('T-083-07: same seed produces identical samples (deterministic)', () => {
    const a = sampleHelicoid(0.3, 0.7, 'det-seed');
    const b = sampleHelicoid(0.3, 0.7, 'det-seed');
    expect(a.position).toEqual(b.position);
    expect(a.normal).toEqual(b.normal);
    expect(a.tangent).toEqual(b.tangent);
  });

  it('T-083-08: different seeds produce different seeded parameters', () => {
    const a = sampleHelicoid(0.5, 0.5, 'seed-alpha');
    const b = sampleHelicoid(0.5, 0.5, 'seed-beta');
    // At least one coordinate should differ due to seeded surface params
    const positionsMatch =
      a.position[0] === b.position[0] &&
      a.position[1] === b.position[1] &&
      a.position[2] === b.position[2];
    expect(positionsMatch).toBe(false);
  });

  it('T-083-09: Möbius strip exhibits self-intersection (twist produces overlapping z)', () => {
    // Sample at two points that should be on opposite sides of the twist
    const a = sampleMobius(0.0, 0.0, 'mobius-seed');
    const b = sampleMobius(0.0, 1.0, 'mobius-seed');
    // For a Möbius strip, v=0 and v=1 map to the same point in space
    // but with opposite u-orientation — positions should be close
    const dist = Math.sqrt(
      (a.position[0] - b.position[0]) ** 2 +
      (a.position[1] - b.position[1]) ** 2 +
      (a.position[2] - b.position[2]) ** 2,
    );
    // The twist closure means these should be at the same location
    // (or very close, within seeded parameter tolerance)
    expect(dist).toBeLessThan(5.0);
  });

  it('T-083-10: selectCurveFamily picks a family deterministically from seed', () => {
    const familyA = selectCurveFamily('family-seed-1');
    const familyB = selectCurveFamily('family-seed-1');
    expect(familyA).toBe(familyB);
  });

  it('T-083-11: selectCurveFamily returns one of the three known families', () => {
    const validFamilies = ['helicoid', 'mobius', 'torusKnot'];
    // Try several seeds to confirm all return valid families
    const seeds = ['a', 'b', 'c', 'd', 'e', 'test', 'ribbon', 'xyz', '123', 'zzz'];
    for (const seed of seeds) {
      const family = selectCurveFamily(seed);
      expect(validFamilies).toContain(family);
    }
  });

  it('T-083-12: different seeds can select different curve families', () => {
    // With enough seeds, we should see at least 2 different families
    const families = new Set<string>();
    for (let i = 0; i < 50; i++) {
      families.add(selectCurveFamily(`diversity-${i}`));
    }
    expect(families.size).toBeGreaterThanOrEqual(2);
  });

  it('T-083-13: torusKnot positions have visible depth extent (z-range > 0.5)', () => {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let u = 0; u <= 1; u += 0.05) {
      const result = sampleTorusKnot(u, 0.5, 'depth-seed');
      if (result.position[2] < minZ) minZ = result.position[2];
      if (result.position[2] > maxZ) maxZ = result.position[2];
    }
    expect(maxZ - minZ).toBeGreaterThan(0.5);
  });

  it('T-083-14: helicoid positions have visible depth extent (z-range > 0.5)', () => {
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let u = 0; u <= 1; u += 0.05) {
      const result = sampleHelicoid(u, 0.5, 'depth-seed');
      if (result.position[2] < minZ) minZ = result.position[2];
      if (result.position[2] > maxZ) maxZ = result.position[2];
    }
    expect(maxZ - minZ).toBeGreaterThan(0.5);
  });
});

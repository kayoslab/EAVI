import { describe, it, expect } from 'vitest';
import {
  generateFractalGeometry,
  selectStrategy,
  computeFractalDepth,
  FRACTAL_STRATEGIES,
  type FractalConfig,
} from '../../../src/visual/generators/fractalGeometry';

function makeConfig(overrides: Partial<FractalConfig> = {}): FractalConfig {
  return {
    strategy: 'faceSubdivision',
    depth: 4,
    pointBudget: 2000,
    seed: 'test-seed',
    ...overrides,
  };
}

function stdDev(arr: Float32Array, offset: number, stride: number, count: number): number {
  if (count === 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += arr[i * stride + offset];
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const d = arr[i * stride + offset] - mean;
    variance += d * d;
  }
  return Math.sqrt(variance / count);
}

describe('US-057: Fractal geometry generator', () => {
  // T-057-01
  it('T-057-01: faceSubdivision returns FractalOutput with positions as Float32Array', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision' }));
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.positions.length).toBe(result.pointCount * 3);
    expect(result.pointCount).toBeGreaterThan(0);
  });

  // T-057-02
  it('T-057-02: branchingGrowth returns FractalOutput with positions as Float32Array', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth' }));
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.positions.length).toBe(result.pointCount * 3);
    expect(result.pointCount).toBeGreaterThan(0);
  });

  // T-057-03
  it('T-057-03: faceSubdivision is deterministic — same seed produces identical output', () => {
    const cfg = makeConfig({ strategy: 'faceSubdivision' });
    const a = generateFractalGeometry(cfg);
    const b = generateFractalGeometry(cfg);
    expect(a.positions).toEqual(b.positions);
    expect(a.edges).toEqual(b.edges);
    expect(a.pointCount).toBe(b.pointCount);
    expect(a.edgeCount).toBe(b.edgeCount);
  });

  // T-057-04
  it('T-057-04: branchingGrowth is deterministic — same seed produces identical output', () => {
    const cfg = makeConfig({ strategy: 'branchingGrowth' });
    const a = generateFractalGeometry(cfg);
    const b = generateFractalGeometry(cfg);
    expect(a.positions).toEqual(b.positions);
    expect(a.edges).toEqual(b.edges);
    expect(a.pointCount).toBe(b.pointCount);
    expect(a.edgeCount).toBe(b.edgeCount);
  });

  // T-057-05
  it('T-057-05: different seeds produce different output for faceSubdivision', () => {
    const a = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision', seed: 'seed-a' }));
    const b = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision', seed: 'seed-b' }));
    expect(a.positions).not.toEqual(b.positions);
  });

  // T-057-06
  it('T-057-06: different seeds produce different output for branchingGrowth', () => {
    const a = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth', seed: 'seed-a' }));
    const b = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth', seed: 'seed-b' }));
    expect(a.positions).not.toEqual(b.positions);
  });

  // T-057-07
  it('T-057-07: faceSubdivision produces non-empty output for each valid depth (3-6)', () => {
    for (const depth of [3, 4, 5, 6]) {
      const result = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision', depth, pointBudget: 50000 }));
      expect(result.pointCount).toBeGreaterThan(0);
      expect(result.positions.length).toBeGreaterThan(0);
    }
  });

  // T-057-08
  it('T-057-08: branchingGrowth produces non-empty output for each valid depth (3-6)', () => {
    for (const depth of [3, 4, 5, 6]) {
      const result = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth', depth, pointBudget: 50000 }));
      expect(result.pointCount).toBeGreaterThan(0);
      expect(result.positions.length).toBeGreaterThan(0);
    }
  });

  // T-057-09
  it('T-057-09: point count stays within pointBudget for faceSubdivision', () => {
    const budget = 500;
    const result = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision', pointBudget: budget, depth: 6 }));
    expect(result.pointCount).toBeLessThanOrEqual(budget);
    expect(result.positions.length).toBeLessThanOrEqual(budget * 3);
  });

  // T-057-10
  it('T-057-10: point count stays within pointBudget for branchingGrowth', () => {
    const budget = 500;
    const result = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth', pointBudget: budget, depth: 6 }));
    expect(result.pointCount).toBeLessThanOrEqual(budget);
    expect(result.positions.length).toBeLessThanOrEqual(budget * 3);
  });

  // T-057-11
  it('T-057-11: edge count stays within bounds and edges format is correct', () => {
    for (const strategy of FRACTAL_STRATEGIES) {
      const result = generateFractalGeometry(makeConfig({ strategy }));
      expect(result.edgeCount).toBeGreaterThanOrEqual(0);
      if (result.edges !== null) {
        expect(result.edges).toBeInstanceOf(Float32Array);
        expect(result.edges.length).toBe(result.edgeCount * 6);
      }
    }
  });

  // T-057-12
  it('T-057-12: all coordinates in positions are finite for faceSubdivision', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision' }));
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  // T-057-13
  it('T-057-13: all coordinates in positions are finite for branchingGrowth', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth' }));
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  // T-057-14
  it('T-057-14: all coordinates in edges are finite', () => {
    for (const strategy of FRACTAL_STRATEGIES) {
      const result = generateFractalGeometry(makeConfig({ strategy }));
      if (result.edges !== null) {
        for (let i = 0; i < result.edges.length; i++) {
          expect(Number.isFinite(result.edges[i])).toBe(true);
        }
      }
    }
  });

  // T-057-15
  it('T-057-15: depth is clamped — depth < 3 treated as 3', () => {
    const base = makeConfig({ strategy: 'faceSubdivision', pointBudget: 50000 });
    const ref = generateFractalGeometry({ ...base, depth: 3 });
    const d1 = generateFractalGeometry({ ...base, depth: 1 });
    const d0 = generateFractalGeometry({ ...base, depth: 0 });
    expect(d1.positions).toEqual(ref.positions);
    expect(d0.positions).toEqual(ref.positions);
  });

  // T-057-16
  it('T-057-16: depth is clamped — depth > 6 treated as 6', () => {
    const base = makeConfig({ strategy: 'faceSubdivision', pointBudget: 50000 });
    const ref = generateFractalGeometry({ ...base, depth: 6 });
    const d10 = generateFractalGeometry({ ...base, depth: 10 });
    const d99 = generateFractalGeometry({ ...base, depth: 99 });
    expect(d10.positions).toEqual(ref.positions);
    expect(d99.positions).toEqual(ref.positions);
  });

  // T-057-17
  it('T-057-17: zero or negative pointBudget returns empty output', () => {
    const r0 = generateFractalGeometry(makeConfig({ pointBudget: 0 }));
    expect(r0.pointCount).toBe(0);
    expect(r0.positions.length).toBe(0);

    const rNeg = generateFractalGeometry(makeConfig({ pointBudget: -10 }));
    expect(rNeg.pointCount).toBe(0);
  });

  // T-057-18
  it('T-057-18: faceSubdivision and branchingGrowth produce visually distinct point distributions', () => {
    const cfg = { depth: 4, pointBudget: 5000, seed: 'distinct-test' };
    const face = generateFractalGeometry(makeConfig({ ...cfg, strategy: 'faceSubdivision' }));
    const branch = generateFractalGeometry(makeConfig({ ...cfg, strategy: 'branchingGrowth' }));

    const faceStdX = stdDev(face.positions, 0, 3, face.pointCount);
    const faceStdY = stdDev(face.positions, 1, 3, face.pointCount);
    const faceStdZ = stdDev(face.positions, 2, 3, face.pointCount);
    const branchStdX = stdDev(branch.positions, 0, 3, branch.pointCount);
    const branchStdY = stdDev(branch.positions, 1, 3, branch.pointCount);
    const branchStdZ = stdDev(branch.positions, 2, 3, branch.pointCount);

    // At least one axis should have significantly different spread
    const ratioX = faceStdX / (branchStdX || 0.001);
    const ratioY = faceStdY / (branchStdY || 0.001);
    const ratioZ = faceStdZ / (branchStdZ || 0.001);

    const hasDifference = [ratioX, ratioY, ratioZ].some(r => r > 1.3 || r < 0.7);
    expect(hasDifference).toBe(true);
  });

  // T-057-19
  it('T-057-19: no stack overflow at max depth with large pointBudget', () => {
    expect(() => {
      const result = generateFractalGeometry(makeConfig({ depth: 6, pointBudget: 50000, strategy: 'faceSubdivision' }));
      expect(result.pointCount).toBeGreaterThan(0);
      for (let i = 0; i < result.positions.length; i++) {
        expect(Number.isFinite(result.positions[i])).toBe(true);
      }
    }).not.toThrow();

    expect(() => {
      const result = generateFractalGeometry(makeConfig({ depth: 6, pointBudget: 50000, strategy: 'branchingGrowth' }));
      expect(result.pointCount).toBeGreaterThan(0);
      for (let i = 0; i < result.positions.length; i++) {
        expect(Number.isFinite(result.positions[i])).toBe(true);
      }
    }).not.toThrow();
  });

  // T-057-20
  it('T-057-20: selectStrategy returns a valid FractalStrategy and is deterministic', () => {
    const s1 = selectStrategy('seed-a');
    expect(['faceSubdivision', 'branchingGrowth']).toContain(s1);

    const s2 = selectStrategy('seed-a');
    expect(s1).toBe(s2);

    // Coverage: ensure both strategies appear across many seeds
    const strategies = new Set<string>();
    for (let i = 0; i < 50; i++) {
      strategies.add(selectStrategy(`coverage-${i}`));
    }
    expect(strategies.size).toBe(2);
  });

  // T-057-21
  it('T-057-21: randoms field is present and has correct length for wireframe compatibility', () => {
    for (const strategy of FRACTAL_STRATEGIES) {
      const result = generateFractalGeometry(makeConfig({ strategy }));
      expect(result.randoms).toBeInstanceOf(Float32Array);
      expect(result.randoms.length).toBe(result.pointCount * 3);
      for (let i = 0; i < result.randoms.length; i++) {
        expect(Number.isFinite(result.randoms[i])).toBe(true);
        expect(result.randoms[i]).toBeGreaterThanOrEqual(0);
        expect(result.randoms[i]).toBeLessThan(1);
      }
    }
  });

  // T-057-22
  it('T-057-22: output positions fit within expected radius (~2.5)', () => {
    for (const strategy of FRACTAL_STRATEGIES) {
      const result = generateFractalGeometry(makeConfig({ strategy, pointBudget: 5000, depth: 5 }));
      for (let i = 0; i < result.pointCount; i++) {
        const x = result.positions[i * 3];
        const y = result.positions[i * 3 + 1];
        const z = result.positions[i * 3 + 2];
        const dist = Math.sqrt(x * x + y * y + z * z);
        expect(dist).toBeLessThanOrEqual(3.0);
      }
    }
  });

  // T-057-23
  it('T-057-23: computeFractalDepth returns value in [3, maxDepth] and is deterministic', () => {
    const d6 = computeFractalDepth('seed', 6);
    expect(d6).toBeGreaterThanOrEqual(3);
    expect(d6).toBeLessThanOrEqual(6);
    expect(Number.isInteger(d6)).toBe(true);

    const d3 = computeFractalDepth('seed', 3);
    expect(d3).toBe(3);

    const d4 = computeFractalDepth('seed', 4);
    expect(d4).toBeGreaterThanOrEqual(3);
    expect(d4).toBeLessThanOrEqual(4);

    // Deterministic
    expect(computeFractalDepth('seed', 6)).toBe(d6);
  });

  // T-057-24
  it('T-057-24: FRACTAL_STRATEGIES contains exactly faceSubdivision and branchingGrowth', () => {
    expect(FRACTAL_STRATEGIES).toHaveLength(2);
    expect(FRACTAL_STRATEGIES).toContain('faceSubdivision');
    expect(FRACTAL_STRATEGIES).toContain('branchingGrowth');
  });

  // T-057-25
  it('T-057-25: faceSubdivision output has 3D volumetric spread (non-coplanar points)', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'faceSubdivision', pointBudget: 5000, depth: 4 }));
    const sx = stdDev(result.positions, 0, 3, result.pointCount);
    const sy = stdDev(result.positions, 1, 3, result.pointCount);
    const sz = stdDev(result.positions, 2, 3, result.pointCount);
    expect(Math.min(sx, sy, sz)).toBeGreaterThan(0.05);
  });

  // T-057-26
  it('T-057-26: branchingGrowth output has 3D volumetric spread (non-coplanar points)', () => {
    const result = generateFractalGeometry(makeConfig({ strategy: 'branchingGrowth', pointBudget: 5000, depth: 4 }));
    const sx = stdDev(result.positions, 0, 3, result.pointCount);
    const sy = stdDev(result.positions, 1, 3, result.pointCount);
    const sz = stdDev(result.positions, 2, 3, result.pointCount);
    expect(Math.min(sx, sy, sz)).toBeGreaterThan(0.05);
  });

  // T-057-27
  it('T-057-27: higher depth produces more points (given sufficient pointBudget)', () => {
    for (const strategy of FRACTAL_STRATEGIES) {
      const d3 = generateFractalGeometry(makeConfig({ strategy, depth: 3, pointBudget: 50000 }));
      const d5 = generateFractalGeometry(makeConfig({ strategy, depth: 5, pointBudget: 50000 }));
      expect(d5.pointCount).toBeGreaterThanOrEqual(d3.pointCount);
    }
  });
});

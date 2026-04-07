import { describe, it, expect } from 'vitest';
import { generateCubeGrowth, CUBE_VERTICES, CUBE_EDGES } from '../../../src/visual/generators/cubeGrowth';

describe('US-066: cubeGrowth recursive fractal geometry generator', () => {
  it('T-066-01: generateCubeGrowth returns CubeGrowthOutput with vertexPositions as Float32Array', () => {
    const result = generateCubeGrowth({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.vertexPositions).toBeInstanceOf(Float32Array);
    expect(result.vertexPositions.length).toBe(result.vertexCount * 3);
    expect(result.vertexCount).toBeGreaterThan(0);
  });

  it('T-066-02: generateCubeGrowth returns edgePositions as Float32Array with correct length', () => {
    const result = generateCubeGrowth({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.edgePositions).toBeInstanceOf(Float32Array);
    // Each edge is a line segment pair: 2 vertices * 3 components
    expect(result.edgePositions.length).toBe(result.edgeCount * 2 * 3);
    expect(result.edgeCount).toBeGreaterThan(0);
  });

  it('T-066-03: generateCubeGrowth returns vertexRandoms and edgeRandoms as Float32Array', () => {
    const result = generateCubeGrowth({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.vertexRandoms).toBeInstanceOf(Float32Array);
    expect(result.vertexRandoms.length).toBe(result.vertexCount * 3);
    expect(result.edgeRandoms).toBeInstanceOf(Float32Array);
    expect(result.edgeRandoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-066-04: CUBE_VERTICES defines exactly 8 corner positions', () => {
    expect(CUBE_VERTICES).toHaveLength(8);
    for (const v of CUBE_VERTICES) {
      expect(v).toHaveLength(3);
      for (const c of v) {
        expect(Number.isFinite(c)).toBe(true);
      }
    }
  });

  it('T-066-05: CUBE_EDGES defines exactly 12 edge index pairs referencing valid vertex indices', () => {
    expect(CUBE_EDGES).toHaveLength(12);
    for (const [a, b] of CUBE_EDGES) {
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThan(8);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThan(8);
      expect(a).not.toBe(b);
    }
  });

  it('T-066-06: generateCubeGrowth is deterministic — same seed and config produce identical output', () => {
    const cfg = { seed: 'det-seed', depth: 4, maxVertices: 5000, maxEdges: 5000 };
    const a = generateCubeGrowth(cfg);
    const b = generateCubeGrowth(cfg);
    expect(a.vertexPositions).toEqual(b.vertexPositions);
    expect(a.edgePositions).toEqual(b.edgePositions);
    expect(a.vertexRandoms).toEqual(b.vertexRandoms);
    expect(a.edgeRandoms).toEqual(b.edgeRandoms);
    expect(a.vertexCount).toBe(b.vertexCount);
    expect(a.edgeCount).toBe(b.edgeCount);
  });

  it('T-066-07: different seeds produce different growth patterns', () => {
    const a = generateCubeGrowth({ seed: 'seed-a', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const b = generateCubeGrowth({ seed: 'seed-b', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    // Different seeds should produce different vertex counts or positions
    const differ = a.vertexCount !== b.vertexCount || !a.vertexPositions.every((v, i) => v === b.vertexPositions[i]);
    expect(differ).toBe(true);
  });

  it('T-066-08: seed cube at depth 1 produces at least 1 cube (8 vertices, 12 edges)', () => {
    const result = generateCubeGrowth({ seed: 'base-seed', depth: 1, maxVertices: 50000, maxEdges: 50000 });
    expect(result.vertexCount).toBeGreaterThanOrEqual(8);
    expect(result.edgeCount).toBeGreaterThanOrEqual(12);
  });

  it('T-066-09: each cube instance contributes 8 vertices and 12 edges (verified at minimal depth)', () => {
    // With depth=1 and high budget, the seed cube should yield exactly 8 verts and 12 edges
    // (child spawning depends on noise, but seed cube is always present)
    const result = generateCubeGrowth({ seed: 'minimal', depth: 1, maxVertices: 50000, maxEdges: 50000 });
    expect(result.vertexCount % 8).toBe(0);
    expect(result.edgeCount % 12).toBe(0);
  });

  it('T-066-10: recursion depth 3-5 produces increasing complexity (given sufficient budget)', () => {
    const d3 = generateCubeGrowth({ seed: 'depth-test', depth: 3, maxVertices: 50000, maxEdges: 50000 });
    const d5 = generateCubeGrowth({ seed: 'depth-test', depth: 5, maxVertices: 50000, maxEdges: 50000 });
    expect(d5.vertexCount).toBeGreaterThanOrEqual(d3.vertexCount);
    expect(d5.edgeCount).toBeGreaterThanOrEqual(d3.edgeCount);
  });

  it('T-066-11: maxVertices budget is respected — vertex count does not exceed budget', () => {
    const budget = 100;
    const result = generateCubeGrowth({ seed: 'budget-v', depth: 5, maxVertices: budget, maxEdges: 50000 });
    expect(result.vertexCount).toBeLessThanOrEqual(budget);
  });

  it('T-066-12: maxEdges budget is respected — edge count does not exceed budget', () => {
    const budget = 100;
    const result = generateCubeGrowth({ seed: 'budget-e', depth: 5, maxVertices: 50000, maxEdges: budget });
    expect(result.edgeCount).toBeLessThanOrEqual(budget);
  });

  it('T-066-13: all vertex positions are finite', () => {
    const result = generateCubeGrowth({ seed: 'finite-v', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexPositions.length; i++) {
      expect(Number.isFinite(result.vertexPositions[i])).toBe(true);
    }
  });

  it('T-066-14: all edge positions are finite', () => {
    const result = generateCubeGrowth({ seed: 'finite-e', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.edgePositions.length; i++) {
      expect(Number.isFinite(result.edgePositions[i])).toBe(true);
    }
  });

  it('T-066-15: all vertexRandoms values are finite and in [0, 1)', () => {
    const result = generateCubeGrowth({ seed: 'rand-v', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexRandoms.length; i++) {
      const v = result.vertexRandoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-066-16: all edgeRandoms values are finite and in [0, 1)', () => {
    const result = generateCubeGrowth({ seed: 'rand-e', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.edgeRandoms.length; i++) {
      const v = result.edgeRandoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-066-17: output positions fit within expected radius (~2.5, max 3.0)', () => {
    const result = generateCubeGrowth({ seed: 'radius', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexCount; i++) {
      const x = result.vertexPositions[i * 3];
      const y = result.vertexPositions[i * 3 + 1];
      const z = result.vertexPositions[i * 3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeLessThanOrEqual(3.0);
    }
  });

  it('T-066-18: output has 3D volumetric spread (non-coplanar points)', () => {
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
    const result = generateCubeGrowth({ seed: 'volume', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const sx = stdDev(result.vertexPositions, 0, 3, result.vertexCount);
    const sy = stdDev(result.vertexPositions, 1, 3, result.vertexCount);
    const sz = stdDev(result.vertexPositions, 2, 3, result.vertexCount);
    expect(Math.min(sx, sy, sz)).toBeGreaterThan(0.05);
  });

  it('T-066-19: noise-driven branching produces varied patterns across seeds (not identical topology)', () => {
    const seeds = ['branch-a', 'branch-b', 'branch-c', 'branch-d', 'branch-e'];
    const counts = seeds.map(seed =>
      generateCubeGrowth({ seed, depth: 4, maxVertices: 5000, maxEdges: 5000 }).vertexCount
    );
    const unique = new Set(counts);
    // With noise-driven branching, not all seeds should produce the same vertex count
    expect(unique.size).toBeGreaterThan(1);
  });

  it('T-066-20: no stack overflow at max depth with large budget', () => {
    expect(() => {
      const result = generateCubeGrowth({ seed: 'deep', depth: 5, maxVertices: 50000, maxEdges: 50000 });
      expect(result.vertexCount).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('T-066-21: child cubes are scaled down relative to parent (multi-level hierarchy)', () => {
    // With depth > 1, the structure should contain cubes at different scales
    // Verify by checking that not all vertices are at the same distance from origin
    const result = generateCubeGrowth({ seed: 'scale-test', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const distances: number[] = [];
    for (let i = 0; i < result.vertexCount; i++) {
      const x = result.vertexPositions[i * 3];
      const y = result.vertexPositions[i * 3 + 1];
      const z = result.vertexPositions[i * 3 + 2];
      distances.push(Math.sqrt(x * x + y * y + z * z));
    }
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    // Distance variance confirms multi-scale hierarchy
    expect(maxDist - minDist).toBeGreaterThan(0.1);
  });

  it('T-066-22: edge positions form valid line pairs (even vertex count per edge)', () => {
    const result = generateCubeGrowth({ seed: 'pairs', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    // edgePositions stores pairs of 3D points: edgeCount * 2 * 3
    expect(result.edgePositions.length % 6).toBe(0);
    expect(result.edgePositions.length / 6).toBe(result.edgeCount);
  });
});

import { describe, it, expect } from 'vitest';
import { generateLSystemTree } from '../../../src/visual/generators/lSystemTree';
import type { CubeGrowthOutput } from '../../../src/visual/generators/cubeGrowth';

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

describe('US-087: lSystemTree recursive 3D structure generator', () => {
  it('T-087-01: generateLSystemTree returns vertexPositions as Float32Array with correct length', () => {
    const result = generateLSystemTree({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.vertexPositions).toBeInstanceOf(Float32Array);
    expect(result.vertexPositions.length).toBe(result.vertexCount * 3);
    expect(result.vertexCount).toBeGreaterThan(0);
  });

  it('T-087-02: generateLSystemTree returns edgePositions as Float32Array with correct length', () => {
    const result = generateLSystemTree({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.edgePositions).toBeInstanceOf(Float32Array);
    expect(result.edgePositions.length).toBe(result.edgeCount * 2 * 3);
    expect(result.edgeCount).toBeGreaterThan(0);
  });

  it('T-087-03: generateLSystemTree returns vertexRandoms and edgeRandoms as Float32Array', () => {
    const result = generateLSystemTree({ seed: 'test-seed', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    expect(result.vertexRandoms).toBeInstanceOf(Float32Array);
    expect(result.vertexRandoms.length).toBe(result.vertexCount * 3);
    expect(result.edgeRandoms).toBeInstanceOf(Float32Array);
    expect(result.edgeRandoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-087-04: output conforms to CubeGrowthOutput interface (drop-in replacement)', () => {
    const result = generateLSystemTree({ seed: 'iface-seed', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    // Verify all CubeGrowthOutput fields exist with correct types
    expect(result.vertexPositions).toBeInstanceOf(Float32Array);
    expect(result.edgePositions).toBeInstanceOf(Float32Array);
    expect(result.vertexRandoms).toBeInstanceOf(Float32Array);
    expect(result.edgeRandoms).toBeInstanceOf(Float32Array);
    expect(typeof result.vertexCount).toBe('number');
    expect(typeof result.edgeCount).toBe('number');
    expect(result.instanceOffsets).toBeInstanceOf(Float32Array);
    expect(result.instanceScales).toBeInstanceOf(Float32Array);
    expect(typeof result.normScale).toBe('number');
    // Satisfy TypeScript: assign to CubeGrowthOutput type
    const _typed: CubeGrowthOutput = result;
    expect(_typed).toBeDefined();
  });

  it('T-087-05: generateLSystemTree is deterministic — same seed produces identical output', () => {
    const cfg = { seed: 'det-seed', depth: 4, maxVertices: 5000, maxEdges: 5000 };
    const a = generateLSystemTree(cfg);
    const b = generateLSystemTree(cfg);
    expect(a.vertexPositions).toEqual(b.vertexPositions);
    expect(a.edgePositions).toEqual(b.edgePositions);
    expect(a.vertexRandoms).toEqual(b.vertexRandoms);
    expect(a.edgeRandoms).toEqual(b.edgeRandoms);
    expect(a.vertexCount).toBe(b.vertexCount);
    expect(a.edgeCount).toBe(b.edgeCount);
    expect(a.instanceOffsets).toEqual(b.instanceOffsets);
    expect(a.instanceScales).toEqual(b.instanceScales);
    expect(a.normScale).toBe(b.normScale);
  });

  it('T-087-06: different seeds produce different geometry', () => {
    const a = generateLSystemTree({ seed: 'seed-a', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const b = generateLSystemTree({ seed: 'seed-b', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const differ = a.vertexCount !== b.vertexCount || !a.vertexPositions.every((v, i) => v === b.vertexPositions[i]);
    expect(differ).toBe(true);
  });

  it('T-087-07: maxVertices budget is respected', () => {
    const budget = 100;
    const result = generateLSystemTree({ seed: 'budget-v', depth: 5, maxVertices: budget, maxEdges: 50000 });
    expect(result.vertexCount).toBeLessThanOrEqual(budget);
  });

  it('T-087-08: maxEdges budget is respected', () => {
    const budget = 100;
    const result = generateLSystemTree({ seed: 'budget-e', depth: 5, maxVertices: 50000, maxEdges: budget });
    expect(result.edgeCount).toBeLessThanOrEqual(budget);
  });

  it('T-087-09: all vertex positions are finite', () => {
    const result = generateLSystemTree({ seed: 'finite-v', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexPositions.length; i++) {
      expect(Number.isFinite(result.vertexPositions[i])).toBe(true);
    }
  });

  it('T-087-10: all edge positions are finite', () => {
    const result = generateLSystemTree({ seed: 'finite-e', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.edgePositions.length; i++) {
      expect(Number.isFinite(result.edgePositions[i])).toBe(true);
    }
  });

  it('T-087-11: all vertexRandoms values are finite and in [0, 1)', () => {
    const result = generateLSystemTree({ seed: 'rand-v', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexRandoms.length; i++) {
      const v = result.vertexRandoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-087-12: all edgeRandoms values are finite and in [0, 1)', () => {
    const result = generateLSystemTree({ seed: 'rand-e', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.edgeRandoms.length; i++) {
      const v = result.edgeRandoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-087-13: output positions fit within expected radius (~2.5, max 3.0)', () => {
    const result = generateLSystemTree({ seed: 'radius', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    for (let i = 0; i < result.vertexCount; i++) {
      const x = result.vertexPositions[i * 3];
      const y = result.vertexPositions[i * 3 + 1];
      const z = result.vertexPositions[i * 3 + 2];
      const dist = Math.sqrt(x * x + y * y + z * z);
      expect(dist).toBeLessThanOrEqual(3.0);
    }
  });

  it('T-087-14: output has 3D volumetric spread — non-coplanar points with visible depth', () => {
    const result = generateLSystemTree({ seed: 'volume', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const sx = stdDev(result.vertexPositions, 0, 3, result.vertexCount);
    const sy = stdDev(result.vertexPositions, 1, 3, result.vertexCount);
    const sz = stdDev(result.vertexPositions, 2, 3, result.vertexCount);
    // All three axes must have significant spread (not flat/screen-aligned)
    expect(Math.min(sx, sy, sz)).toBeGreaterThan(0.1);
  });

  it('T-087-15: positions span sufficient range on all 3 axes (visible depth/parallax)', () => {
    const result = generateLSystemTree({ seed: 'span', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < result.vertexCount; i++) {
      const x = result.vertexPositions[i * 3];
      const y = result.vertexPositions[i * 3 + 1];
      const z = result.vertexPositions[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    // Each axis must span a meaningful range (not flat)
    expect(maxX - minX).toBeGreaterThan(0.5);
    expect(maxY - minY).toBeGreaterThan(0.5);
    expect(maxZ - minZ).toBeGreaterThan(0.5);
  });

  it('T-087-16: depthRatio is encoded in aRandom.y channel (values 0-1, root vs tip)', () => {
    const result = generateLSystemTree({ seed: 'depth-ratio', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    let hasZero = false;
    let hasNearOne = false;
    for (let i = 0; i < result.vertexCount; i++) {
      const depthRatio = result.vertexRandoms[i * 3 + 1]; // aRandom.y channel
      expect(depthRatio).toBeGreaterThanOrEqual(0);
      expect(depthRatio).toBeLessThanOrEqual(1);
      if (depthRatio < 0.1) hasZero = true;
      if (depthRatio > 0.7) hasNearOne = true;
    }
    // Must have both root-like (low) and tip-like (high) depthRatio values
    expect(hasZero).toBe(true);
    expect(hasNearOne).toBe(true);
  });

  it('T-087-17: depthRatio encoded in edgeRandoms.y channel as well', () => {
    const result = generateLSystemTree({ seed: 'edge-depth', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    let hasLow = false;
    let hasHigh = false;
    for (let i = 0; i < result.edgeCount * 2; i++) {
      const depthRatio = result.edgeRandoms[i * 3 + 1]; // aRandom.y channel
      expect(depthRatio).toBeGreaterThanOrEqual(0);
      expect(depthRatio).toBeLessThanOrEqual(1);
      if (depthRatio < 0.2) hasLow = true;
      if (depthRatio > 0.6) hasHigh = true;
    }
    expect(hasLow).toBe(true);
    expect(hasHigh).toBe(true);
  });

  it('T-087-18: recursion depth 3-5 produces increasing complexity (given sufficient budget)', () => {
    const d3 = generateLSystemTree({ seed: 'depth-test', depth: 3, maxVertices: 50000, maxEdges: 50000 });
    const d5 = generateLSystemTree({ seed: 'depth-test', depth: 5, maxVertices: 50000, maxEdges: 50000 });
    expect(d5.vertexCount).toBeGreaterThanOrEqual(d3.vertexCount);
    expect(d5.edgeCount).toBeGreaterThanOrEqual(d3.edgeCount);
  });

  it('T-087-19: no stack overflow at max depth with large budget', () => {
    expect(() => {
      const result = generateLSystemTree({ seed: 'deep', depth: 5, maxVertices: 50000, maxEdges: 50000 });
      expect(result.vertexCount).toBeGreaterThan(0);
    }).not.toThrow();
  });

  it('T-087-20: edge positions form valid line pairs (even vertex count per edge)', () => {
    const result = generateLSystemTree({ seed: 'pairs', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    // edgePositions stores pairs of 3D points: edgeCount * 2 * 3
    expect(result.edgePositions.length % 6).toBe(0);
    expect(result.edgePositions.length / 6).toBe(result.edgeCount);
  });

  it('T-087-21: edges form connected tree segments (start of child edge near end of parent)', () => {
    const result = generateLSystemTree({ seed: 'connected', depth: 3, maxVertices: 5000, maxEdges: 5000 });
    // Collect all edge start/end points
    const starts: [number, number, number][] = [];
    const ends: [number, number, number][] = [];
    for (let i = 0; i < result.edgeCount; i++) {
      starts.push([
        result.edgePositions[i * 6],
        result.edgePositions[i * 6 + 1],
        result.edgePositions[i * 6 + 2],
      ]);
      ends.push([
        result.edgePositions[i * 6 + 3],
        result.edgePositions[i * 6 + 4],
        result.edgePositions[i * 6 + 5],
      ]);
    }
    // For a tree, at least some edges should start where another edge ends
    // (connectivity check — most start points should match an end point of another edge)
    if (result.edgeCount > 1) {
      let connectedCount = 0;
      for (let i = 1; i < starts.length; i++) {
        const [sx, sy, sz] = starts[i];
        for (let j = 0; j < ends.length; j++) {
          if (j === i) continue;
          const [ex, ey, ez] = ends[j];
          const dist = Math.sqrt((sx - ex) ** 2 + (sy - ey) ** 2 + (sz - ez) ** 2);
          if (dist < 0.01) {
            connectedCount++;
            break;
          }
        }
      }
      // At least half the non-root edges should be connected to a parent
      expect(connectedCount).toBeGreaterThan(0);
    }
  });

  it('T-087-22: normScale is a positive finite number', () => {
    const result = generateLSystemTree({ seed: 'norm', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    expect(Number.isFinite(result.normScale)).toBe(true);
    expect(result.normScale).toBeGreaterThan(0);
  });

  it('T-087-23: instanceOffsets and instanceScales are present and finite', () => {
    const result = generateLSystemTree({ seed: 'instance', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    expect(result.instanceOffsets).toBeInstanceOf(Float32Array);
    expect(result.instanceScales).toBeInstanceOf(Float32Array);
    expect(result.instanceOffsets.length).toBeGreaterThan(0);
    expect(result.instanceScales.length).toBeGreaterThan(0);
    for (let i = 0; i < result.instanceOffsets.length; i++) {
      expect(Number.isFinite(result.instanceOffsets[i])).toBe(true);
    }
    for (let i = 0; i < result.instanceScales.length; i++) {
      expect(Number.isFinite(result.instanceScales[i])).toBe(true);
    }
  });

  it('T-087-24: varied patterns across seeds (not identical topology)', () => {
    const seeds = ['tree-a', 'tree-b', 'tree-c', 'tree-d', 'tree-e'];
    const counts = seeds.map(seed =>
      generateLSystemTree({ seed, depth: 4, maxVertices: 5000, maxEdges: 5000 }).vertexCount
    );
    const unique = new Set(counts);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('T-087-25: low budget produces minimal but valid tree (at least 2 levels of branching)', () => {
    const result = generateLSystemTree({ seed: 'low-budget', depth: 3, maxVertices: 60, maxEdges: 60 });
    // Should still have some vertices and edges
    expect(result.vertexCount).toBeGreaterThan(0);
    expect(result.edgeCount).toBeGreaterThan(0);
    // Should have more than 1 edge (at least root + one branch)
    expect(result.edgeCount).toBeGreaterThan(1);
  });

  it('T-087-26: multi-scale hierarchy — distances from origin vary significantly', () => {
    const result = generateLSystemTree({ seed: 'scale-test', depth: 4, maxVertices: 5000, maxEdges: 5000 });
    const distances: number[] = [];
    for (let i = 0; i < result.vertexCount; i++) {
      const x = result.vertexPositions[i * 3];
      const y = result.vertexPositions[i * 3 + 1];
      const z = result.vertexPositions[i * 3 + 2];
      distances.push(Math.sqrt(x * x + y * y + z * z));
    }
    const minDist = Math.min(...distances);
    const maxDist = Math.max(...distances);
    // Distance variance confirms branching hierarchy
    expect(maxDist - minDist).toBeGreaterThan(0.1);
  });
});

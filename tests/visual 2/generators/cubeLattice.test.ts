import { describe, it, expect } from 'vitest';
import { generateCubeLattice } from '../../../src/visual/generators/cubeLattice';
import { hashRandomFromPosition } from '../../../src/visual/generators/subdivideEdges';

describe('US-068: Cube lattice generator', () => {
  it('T-068-01: generateCubeLattice returns correct unique vertex count for NxNxN grid ((N+1)^3)', () => {
    const r3 = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(r3.vertices.vertexCount).toBe(64); // (3+1)^3

    const r5 = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    expect(r5.vertices.vertexCount).toBe(216); // (5+1)^3

    const r7 = generateCubeLattice({ gridSize: 7, cellSize: 1.0 });
    expect(r7.vertices.vertexCount).toBe(512); // (7+1)^3
  });

  it('T-068-02: generateCubeLattice returns correct merged edge count (3*N*(N+1)^2)', () => {
    const r3 = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(r3.edges.edgeCount).toBe(144); // 3*3*16

    const r5 = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    expect(r5.edges.edgeCount).toBe(540); // 3*5*36

    const r7 = generateCubeLattice({ gridSize: 7, cellSize: 1.0 });
    expect(r7.edges.edgeCount).toBe(1344); // 3*7*64
  });

  it('T-068-03: vertex positions array length equals vertexCount * 3', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.vertices.positions.length).toBe(result.vertices.vertexCount * 3);
  });

  it('T-068-04: vertex aRandom array length equals vertexCount * 3', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.vertices.aRandom.length).toBe(result.vertices.vertexCount * 3);
  });

  it('T-068-05: edge positions array length equals edgeCount * 2 * 3', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.edges.positions.length).toBe(result.edges.edgeCount * 2 * 3);
  });

  it('T-068-06: edge randoms array length equals edgeCount * 2 * 3', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.edges.randoms.length).toBe(result.edges.edgeCount * 2 * 3);
  });

  it('T-068-07: all vertex positions are finite', () => {
    const result = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    for (let i = 0; i < result.vertices.positions.length; i++) {
      expect(Number.isFinite(result.vertices.positions[i])).toBe(true);
    }
  });

  it('T-068-08: all vertex aRandom values are finite and in [0, 1)', () => {
    const result = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    for (let i = 0; i < result.vertices.aRandom.length; i++) {
      const v = result.vertices.aRandom[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-068-09: all edge position values are finite', () => {
    const result = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    for (let i = 0; i < result.edges.positions.length; i++) {
      expect(Number.isFinite(result.edges.positions[i])).toBe(true);
    }
  });

  it('T-068-10: all edge random values are finite and in [0, 1)', () => {
    const result = generateCubeLattice({ gridSize: 5, cellSize: 1.0 });
    for (let i = 0; i < result.edges.randoms.length; i++) {
      const v = result.edges.randoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-068-11: output arrays are Float32Array instances', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.vertices.positions).toBeInstanceOf(Float32Array);
    expect(result.vertices.aRandom).toBeInstanceOf(Float32Array);
    expect(result.edges.positions).toBeInstanceOf(Float32Array);
    expect(result.edges.randoms).toBeInstanceOf(Float32Array);
  });

  it('T-068-12: generator is deterministic -- same seed produces identical output', () => {
    const a = generateCubeLattice({ gridSize: 4, cellSize: 1.0 });
    const b = generateCubeLattice({ gridSize: 4, cellSize: 1.0 });

    expect(a.vertices.vertexCount).toBe(b.vertices.vertexCount);
    expect(a.edges.edgeCount).toBe(b.edges.edgeCount);
    expect(a.vertices.positions).toEqual(b.vertices.positions);
    expect(a.vertices.aRandom).toEqual(b.vertices.aRandom);
  });

  it('T-068-13: lattice is centered at origin', () => {
    const result = generateCubeLattice({ gridSize: 4, cellSize: 1.0 });
    const positions = result.vertices.positions;
    let sumX = 0, sumY = 0, sumZ = 0;
    const count = result.vertices.vertexCount;
    for (let i = 0; i < count; i++) {
      sumX += positions[i * 3];
      sumY += positions[i * 3 + 1];
      sumZ += positions[i * 3 + 2];
    }
    expect(Math.abs(sumX / count)).toBeLessThan(0.001);
    expect(Math.abs(sumY / count)).toBeLessThan(0.001);
    expect(Math.abs(sumZ / count)).toBeLessThan(0.001);
  });

  it('T-068-14: cellSize parameter controls spacing between vertices', () => {
    const r1 = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    const r2 = generateCubeLattice({ gridSize: 3, cellSize: 2.0 });

    // Compute bounding extent (max - min) along X
    let min1 = Infinity, max1 = -Infinity;
    let min2 = Infinity, max2 = -Infinity;
    for (let i = 0; i < r1.vertices.vertexCount; i++) {
      const x1 = r1.vertices.positions[i * 3];
      min1 = Math.min(min1, x1);
      max1 = Math.max(max1, x1);
      const x2 = r2.vertices.positions[i * 3];
      min2 = Math.min(min2, x2);
      max2 = Math.max(max2, x2);
    }
    const extent1 = max1 - min1;
    const extent2 = max2 - min2;
    expect(extent2).toBeCloseTo(extent1 * 2, 5);
  });

  it('T-068-15: aRandom uses hashRandomFromPosition (matches helper output for known vertex)', () => {
    const result = generateCubeLattice({ gridSize: 2, cellSize: 1.0 });
    // First vertex is at (-offset, -offset, -offset)
    const x = result.vertices.positions[0];
    const y = result.vertices.positions[1];
    const z = result.vertices.positions[2];
    const [r0, r1, r2] = hashRandomFromPosition(x, y, z);
    expect(result.vertices.aRandom[0]).toBeCloseTo(r0, 5);
    expect(result.vertices.aRandom[1]).toBeCloseTo(r1, 5);
    expect(result.vertices.aRandom[2]).toBeCloseTo(r2, 5);
  });

  it('T-068-16: each cube in the lattice has 12 edges (verified by total edge formula)', () => {
    const result = generateCubeLattice({ gridSize: 1, cellSize: 1.0 });
    expect(result.edges.edgeCount).toBe(12);
    expect(result.vertices.vertexCount).toBe(8);
  });
});

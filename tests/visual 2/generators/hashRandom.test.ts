import { describe, it, expect } from 'vitest';
import { hashRandomFromPosition } from '../../../src/visual/generators/subdivideEdges';
import { generatePolyhedronEdges } from '../../../src/visual/generators/polyhedraEdges';
import { subdivideEdges } from '../../../src/visual/generators/subdivideEdges';

describe('US-065: Position-based aRandom hashing', () => {
  // --- hashRandomFromPosition shared helper ---

  it('T-065-18: hashRandomFromPosition returns 3-element tuple', () => {
    const result = hashRandomFromPosition(1, 2, 3);
    expect(result).toHaveLength(3);
  });

  it('T-065-19: hashRandomFromPosition values are in [0, 1)', () => {
    const positions = [[0, 0, 0], [1, 0, 0], [0.3, -0.2, 0.15], [-1, -1, -1], [100, 200, 300]];
    for (const [x, y, z] of positions) {
      const [r0, r1, r2] = hashRandomFromPosition(x, y, z);
      expect(r0).toBeGreaterThanOrEqual(0);
      expect(r0).toBeLessThan(1);
      expect(r1).toBeGreaterThanOrEqual(0);
      expect(r1).toBeLessThan(1);
      expect(r2).toBeGreaterThanOrEqual(0);
      expect(r2).toBeLessThan(1);
    }
  });

  it('T-065-20: hashRandomFromPosition is deterministic (same input → same output)', () => {
    const a = hashRandomFromPosition(0.3, -0.1, 0.2);
    const b = hashRandomFromPosition(0.3, -0.1, 0.2);
    expect(a[0]).toBe(b[0]);
    expect(a[1]).toBe(b[1]);
    expect(a[2]).toBe(b[2]);
  });

  it('T-065-21: hashRandomFromPosition produces different values for different positions', () => {
    const a = hashRandomFromPosition(0.1, 0.2, 0.3);
    const b = hashRandomFromPosition(0.4, 0.5, 0.6);
    // At least one component should differ
    const allSame = a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
    expect(allSame).toBe(false);
  });

  it('T-065-22: hashRandomFromPosition returns finite values for all inputs', () => {
    const extremes = [[0, 0, 0], [1e6, 1e6, 1e6], [-1e6, -1e6, -1e6], [NaN, 0, 0]];
    for (const [x, y, z] of extremes) {
      const result = hashRandomFromPosition(x, y, z);
      for (let i = 0; i < 3; i++) {
        // NaN input may produce NaN output, that's acceptable — test non-NaN inputs for finiteness
        if (!Number.isNaN(x) && !Number.isNaN(y) && !Number.isNaN(z)) {
          expect(Number.isFinite(result[i]), `non-finite for (${x},${y},${z})[${i}]`).toBe(true);
        }
      }
    }
  });

  // --- polyhedraEdges.ts uses position-based hashing ---

  it('T-065-23: generatePolyhedronEdges randoms are position-based (same position → same aRandom)', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'hash-check' });
    // Icosahedron has shared vertices across edges. Find duplicate positions and verify matching randoms.
    const posToRandoms = new Map<string, number[]>();
    const vertCount = edgeData.edgeCount * 2;
    for (let i = 0; i < vertCount; i++) {
      const key = `${Math.round(edgeData.positions[i * 3] * 1e6)},${Math.round(edgeData.positions[i * 3 + 1] * 1e6)},${Math.round(edgeData.positions[i * 3 + 2] * 1e6)}`;
      const randoms = [edgeData.randoms[i * 3], edgeData.randoms[i * 3 + 1], edgeData.randoms[i * 3 + 2]];
      if (posToRandoms.has(key)) {
        const existing = posToRandoms.get(key)!;
        expect(randoms[0]).toBeCloseTo(existing[0], 5);
        expect(randoms[1]).toBeCloseTo(existing[1], 5);
        expect(randoms[2]).toBeCloseTo(existing[2], 5);
      } else {
        posToRandoms.set(key, randoms);
      }
    }
    // Icosahedron has 12 unique positions but 60 edge endpoints — must have duplicates
    expect(posToRandoms.size).toBe(12);
  });

  it('T-065-24: generatePolyhedronEdges randoms match hashRandomFromPosition', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'tetrahedron', seed: 'hash-match' });
    for (let i = 0; i < edgeData.edgeCount * 2; i++) {
      const x = edgeData.positions[i * 3];
      const y = edgeData.positions[i * 3 + 1];
      const z = edgeData.positions[i * 3 + 2];
      const [r0, r1, r2] = hashRandomFromPosition(x, y, z);
      expect(edgeData.randoms[i * 3]).toBeCloseTo(r0, 5);
      expect(edgeData.randoms[i * 3 + 1]).toBeCloseTo(r1, 5);
      expect(edgeData.randoms[i * 3 + 2]).toBeCloseTo(r2, 5);
    }
  });

  // --- subdivideEdges.ts endpoint aRandom matches edge endpoint aRandom ---

  it('T-065-25: subdivideEdges endpoint aRandom matches edge generator aRandom for shared positions', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'octahedron', seed: 'subdiv-match' });
    const subdivided = subdivideEdges(edgeData.positions, 4);
    // Each original edge becomes 4 sub-segments = 8 vertices.
    // First vertex of first sub-segment should match original edge start.
    for (let e = 0; e < edgeData.edgeCount; e++) {
      const origX = edgeData.positions[e * 6];
      const origY = edgeData.positions[e * 6 + 1];
      const origZ = edgeData.positions[e * 6 + 2];
      const subBase = e * 4 * 2; // subdivisions * 2 verts per sub-segment
      const subX = subdivided.positions[subBase * 3];
      const subY = subdivided.positions[subBase * 3 + 1];
      const subZ = subdivided.positions[subBase * 3 + 2];
      // Positions should match
      expect(subX).toBeCloseTo(origX, 5);
      expect(subY).toBeCloseTo(origY, 5);
      expect(subZ).toBeCloseTo(origZ, 5);
      // aRandom at start of subdivided edge should match edge generator aRandom
      const [r0, r1, r2] = hashRandomFromPosition(origX, origY, origZ);
      expect(subdivided.aRandom[subBase * 3]).toBeCloseTo(r0, 5);
      expect(subdivided.aRandom[subBase * 3 + 1]).toBeCloseTo(r1, 5);
      expect(subdivided.aRandom[subBase * 3 + 2]).toBeCloseTo(r2, 5);
    }
  });
});

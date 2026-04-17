import { describe, it, expect } from 'vitest';
import { generateLatticeCluster } from '../../../src/visual/generators/latticeCluster';
import type { LatticeClusterConfig } from '../../../src/visual/generators/latticeCluster';

function makeConfig(overrides?: Partial<LatticeClusterConfig>): LatticeClusterConfig {
  return {
    nodeCount: 8,
    pointsPerCrystal: 500,
    latticeType: 'hex',
    latticeSpacing: 1.2,
    crystalHeight: 1.0,
    crystalRadius: 0.4,
    seed: 'test-lattice',
    ...overrides,
  };
}

describe('US-085: Lattice cluster point generator', () => {
  it('T-085-01: returns positions, latticePositions, and facetNormals arrays', () => {
    const result = generateLatticeCluster(makeConfig());
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.latticePositions).toBeInstanceOf(Float32Array);
    expect(result.facetNormals).toBeInstanceOf(Float32Array);
  });

  it('T-085-02: output arrays have correct length (3 * nodeCount * pointsPerCrystal)', () => {
    const config = makeConfig({ nodeCount: 6, pointsPerCrystal: 100 });
    const result = generateLatticeCluster(config);
    const expectedLen = 6 * 100 * 3;
    expect(result.positions.length).toBe(expectedLen);
    expect(result.latticePositions.length).toBe(expectedLen);
    expect(result.facetNormals.length).toBe(expectedLen);
  });

  it('T-085-03: all position values are finite (no NaN or Infinity)', () => {
    const result = generateLatticeCluster(makeConfig());
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it('T-085-04: all latticePositions values are finite', () => {
    const result = generateLatticeCluster(makeConfig());
    for (let i = 0; i < result.latticePositions.length; i++) {
      expect(Number.isFinite(result.latticePositions[i])).toBe(true);
    }
  });

  it('T-085-05: all facetNormals values are finite', () => {
    const result = generateLatticeCluster(makeConfig());
    for (let i = 0; i < result.facetNormals.length; i++) {
      expect(Number.isFinite(result.facetNormals[i])).toBe(true);
    }
  });

  it('T-085-06: facet normals are approximately unit length', () => {
    const result = generateLatticeCluster(makeConfig());
    const totalPoints = result.facetNormals.length / 3;
    for (let i = 0; i < totalPoints; i++) {
      const nx = result.facetNormals[i * 3];
      const ny = result.facetNormals[i * 3 + 1];
      const nz = result.facetNormals[i * 3 + 2];
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      expect(len).toBeCloseTo(1.0, 1);
    }
  });

  it('T-085-07: lattice nodes share a common orientation basis (latticePositions cluster into nodeCount distinct groups)', () => {
    const config = makeConfig({ nodeCount: 6, pointsPerCrystal: 50 });
    const result = generateLatticeCluster(config);
    const totalPoints = result.latticePositions.length / 3;

    // Collect unique lattice positions (within tolerance)
    const uniqueNodes: Array<[number, number, number]> = [];
    const tolerance = 0.001;

    for (let i = 0; i < totalPoints; i++) {
      const lx = result.latticePositions[i * 3];
      const ly = result.latticePositions[i * 3 + 1];
      const lz = result.latticePositions[i * 3 + 2];

      const found = uniqueNodes.some(([ux, uy, uz]) =>
        Math.abs(lx - ux) < tolerance &&
        Math.abs(ly - uy) < tolerance &&
        Math.abs(lz - uz) < tolerance,
      );
      if (!found) {
        uniqueNodes.push([lx, ly, lz]);
      }
    }

    expect(uniqueNodes.length).toBe(config.nodeCount);
  });

  it('T-085-08: points are distributed in 3D (Z-depth span > 0.5)', () => {
    const result = generateLatticeCluster(makeConfig());
    let minZ = Infinity, maxZ = -Infinity;
    const totalPoints = result.positions.length / 3;
    for (let i = 0; i < totalPoints; i++) {
      const z = result.positions[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(0.5);
  });

  it('T-085-09: same seed produces identical output (deterministic)', () => {
    const config = makeConfig({ seed: 'determinism-check' });
    const a = generateLatticeCluster(config);
    const b = generateLatticeCluster(config);
    expect(a.positions).toEqual(b.positions);
    expect(a.latticePositions).toEqual(b.latticePositions);
    expect(a.facetNormals).toEqual(b.facetNormals);
  });

  it('T-085-10: different seeds produce different output', () => {
    const a = generateLatticeCluster(makeConfig({ seed: 'seed-alpha' }));
    const b = generateLatticeCluster(makeConfig({ seed: 'seed-beta' }));
    expect(a.positions).not.toEqual(b.positions);
  });

  it('T-085-11: lattice type "bcc" produces valid output', () => {
    const result = generateLatticeCluster(makeConfig({ latticeType: 'bcc' }));
    expect(result.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it('T-085-12: points belong to their respective lattice node (each point is near its latticePosition)', () => {
    const config = makeConfig({ nodeCount: 4, pointsPerCrystal: 100, crystalRadius: 0.4, crystalHeight: 1.0 });
    const result = generateLatticeCluster(config);
    const totalPoints = result.positions.length / 3;
    // Each point should be within a reasonable distance of its lattice node
    const maxExpectedDist = config.crystalHeight + config.crystalRadius + 0.5; // generous bound

    for (let i = 0; i < totalPoints; i++) {
      const px = result.positions[i * 3];
      const py = result.positions[i * 3 + 1];
      const pz = result.positions[i * 3 + 2];
      const lx = result.latticePositions[i * 3];
      const ly = result.latticePositions[i * 3 + 1];
      const lz = result.latticePositions[i * 3 + 2];

      const dist = Math.sqrt((px - lx) ** 2 + (py - ly) ** 2 + (pz - lz) ** 2);
      expect(dist).toBeLessThan(maxExpectedDist);
    }
  });

  it('T-085-13: lattice nodes are spaced approximately by latticeSpacing', () => {
    const spacing = 1.5;
    const config = makeConfig({ nodeCount: 8, pointsPerCrystal: 10, latticeSpacing: spacing });
    const result = generateLatticeCluster(config);
    const totalPoints = result.latticePositions.length / 3;

    // Collect unique nodes
    const nodes: Array<[number, number, number]> = [];
    const tolerance = 0.001;
    for (let i = 0; i < totalPoints; i++) {
      const lx = result.latticePositions[i * 3];
      const ly = result.latticePositions[i * 3 + 1];
      const lz = result.latticePositions[i * 3 + 2];
      const found = nodes.some(([ux, uy, uz]) =>
        Math.abs(lx - ux) < tolerance &&
        Math.abs(ly - uy) < tolerance &&
        Math.abs(lz - uz) < tolerance,
      );
      if (!found) nodes.push([lx, ly, lz]);
    }

    // Find minimum inter-node distance
    let minDist = Infinity;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const d = Math.sqrt(
          (nodes[i][0] - nodes[j][0]) ** 2 +
          (nodes[i][1] - nodes[j][1]) ** 2 +
          (nodes[i][2] - nodes[j][2]) ** 2,
        );
        if (d < minDist) minDist = d;
      }
    }

    // Min distance should be related to the spacing (within jitter tolerance)
    // Spacing * 0.5 accounts for jitter up to 50% — generous lower bound
    expect(minDist).toBeGreaterThan(spacing * 0.3);
    // Should not be wildly large either
    expect(minDist).toBeLessThan(spacing * 3);
  });

  it('T-085-14: minimum 200 points per crystal at low node count', () => {
    // Even with low overall points, each crystal should get at least some minimum
    const config = makeConfig({ nodeCount: 4, pointsPerCrystal: 200 });
    const result = generateLatticeCluster(config);
    expect(result.positions.length / 3).toBe(4 * 200);
  });

  it('T-085-15: boundary — nodeCount=1 produces a single crystal cluster', () => {
    const result = generateLatticeCluster(makeConfig({ nodeCount: 1, pointsPerCrystal: 300 }));
    expect(result.positions.length).toBe(300 * 3);

    // All lattice positions should be the same node
    const lx = result.latticePositions[0];
    const ly = result.latticePositions[1];
    const lz = result.latticePositions[2];
    for (let i = 1; i < 300; i++) {
      expect(result.latticePositions[i * 3]).toBeCloseTo(lx, 3);
      expect(result.latticePositions[i * 3 + 1]).toBeCloseTo(ly, 3);
      expect(result.latticePositions[i * 3 + 2]).toBeCloseTo(lz, 3);
    }
  });

  it('T-085-16: boundary — nodeCount=12 (max recommended) produces valid output', () => {
    const result = generateLatticeCluster(makeConfig({ nodeCount: 12, pointsPerCrystal: 400 }));
    expect(result.positions.length).toBe(12 * 400 * 3);
    // Spot-check finiteness
    for (let i = 0; i < Math.min(1000, result.positions.length); i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });
});

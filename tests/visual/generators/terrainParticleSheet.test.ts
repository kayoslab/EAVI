import { describe, it, expect } from 'vitest';
import { generateTerrainParticleSheet } from '../../../src/visual/generators/terrainParticleSheet';

describe('US-076: Terrain particle sheet generator', () => {
  it('T-076-G01: returns positions array of length pointCount * 3', () => {
    const result = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 5000, seed: 'pos-len' });
    expect(result.positions.length).toBe(result.pointCount * 3);
  });

  it('T-076-G02: returns randoms array of length pointCount * 3', () => {
    const result = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 5000, seed: 'rand-len' });
    expect(result.randoms.length).toBe(result.pointCount * 3);
  });

  it('T-076-G03: output arrays are Float32Array instances', () => {
    const result = generateTerrainParticleSheet({ rows: 5, cols: 5, pointCount: 1000, seed: 'type-check' });
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.randoms).toBeInstanceOf(Float32Array);
  });

  it('T-076-G04: pointCount in result matches rows*cols (grid-based)', () => {
    const result = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 20000, seed: 'count' });
    // Grid-based terrain uses actualRows*actualCols as pointCount, ignoring requested pointCount
    expect(result.pointCount).toBe(10 * 10);
  });

  it('T-076-G05: all position values are finite', () => {
    const result = generateTerrainParticleSheet({ rows: 15, cols: 20, pointCount: 10000, seed: 'finite-pos' });
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i]), `position[${i}] is not finite`).toBe(true);
    }
  });

  it('T-076-G06: all random values are finite and in [0, 1)', () => {
    const result = generateTerrainParticleSheet({ rows: 15, cols: 20, pointCount: 10000, seed: 'finite-rand' });
    for (let i = 0; i < result.randoms.length; i++) {
      const v = result.randoms[i];
      expect(Number.isFinite(v), `randoms[${i}] is not finite`).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-076-G07: output is deterministic — same seed produces identical positions', () => {
    const a = generateTerrainParticleSheet({ rows: 10, cols: 15, pointCount: 5000, seed: 'det-test' });
    const b = generateTerrainParticleSheet({ rows: 10, cols: 15, pointCount: 5000, seed: 'det-test' });
    expect(a.pointCount).toBe(b.pointCount);
    expect(a.positions).toEqual(b.positions);
    expect(a.randoms).toEqual(b.randoms);
  });

  it('T-076-G08: different seeds produce different positions', () => {
    const a = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 5000, seed: 'seed-alpha' });
    const b = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 5000, seed: 'seed-beta' });
    let diffCount = 0;
    for (let i = 0; i < a.positions.length; i++) {
      if (Math.abs(a.positions[i] - b.positions[i]) > 0.0001) {
        diffCount++;
      }
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('T-076-G09: heights (Y values) are not all zero — terrain has visible hills', () => {
    const result = generateTerrainParticleSheet({ rows: 20, cols: 20, pointCount: 10000, seed: 'hills' });
    let nonZeroCount = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      if (Math.abs(result.positions[i + 1]) > 0.001) {
        nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it('T-076-G10: height range is meaningful — min Y !== max Y', () => {
    const result = generateTerrainParticleSheet({ rows: 20, cols: 20, pointCount: 10000, seed: 'range-test', heightScale: 2.0 });
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      const y = result.positions[i + 1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    expect(maxY - minY).toBeGreaterThan(0.1);
  });

  it('T-076-G11: grid extents — X positions span approximately [-width/2, width/2]', () => {
    const width = 10;
    const depth = 10;
    const result = generateTerrainParticleSheet({
      rows: 10, cols: 10, pointCount: 20000, seed: 'extents', width, depth,
    });
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      const x = result.positions[i];
      const z = result.positions[i + 2];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    // Grid-based placement: X spans [-width/2, width/2], Z spans [-depth, 0]
    expect(minX).toBeGreaterThanOrEqual(-width / 2 - 1);
    expect(maxX).toBeLessThanOrEqual(width / 2 + 1);
    // Z now spans into negative (into screen)
    expect(minZ).toBeGreaterThanOrEqual(-depth - 1);
    expect(maxZ).toBeLessThanOrEqual(1);
    // Coverage: points should reach close to extents
    expect(maxX - minX).toBeGreaterThan(width * 0.8);
    expect(Math.abs(maxZ - minZ)).toBeGreaterThan(depth * 0.8);
  });

  it('T-076-G12: points are NOT locked to grid intersections — jittered XZ', () => {
    const rows = 20;
    const cols = 20;
    const width = 10;
    const depth = 10;
    const result = generateTerrainParticleSheet({
      rows, cols, pointCount: 10000, seed: 'jitter-test', width, depth,
    });

    // If points were on grid intersections, X positions would cluster at
    // multiples of (width / cols). With jitter, we should see X values
    // that don't align with the grid.
    const cellWidth = width / cols;
    const cellDepth = depth / rows;
    let offGridCount = 0;
    for (let i = 0; i < result.positions.length; i += 3) {
      const x = result.positions[i];
      const z = result.positions[i + 2];
      // Compute distance to nearest grid intersection
      const xGrid = Math.round((x + width / 2) / cellWidth) * cellWidth - width / 2;
      const zGrid = Math.round((z + depth / 2) / cellDepth) * cellDepth - depth / 2;
      const distX = Math.abs(x - xGrid);
      const distZ = Math.abs(z - zGrid);
      // If off-grid by more than 1% of cell size in either axis, count as jittered
      if (distX > cellWidth * 0.01 || distZ > cellDepth * 0.01) {
        offGridCount++;
      }
    }
    // Vast majority of points should be off-grid (jittered)
    const totalPoints = result.pointCount;
    expect(offGridCount / totalPoints).toBeGreaterThan(0.8);
  });

  it('T-076-G13: heightScale parameter controls amplitude of Y displacement', () => {
    const low = generateTerrainParticleSheet({ rows: 15, cols: 15, pointCount: 5000, seed: 'scale', heightScale: 1.0 });
    const high = generateTerrainParticleSheet({ rows: 15, cols: 15, pointCount: 5000, seed: 'scale', heightScale: 4.0 });
    let maxYLow = -Infinity, maxYHigh = -Infinity;
    for (let i = 0; i < low.positions.length; i += 3) {
      maxYLow = Math.max(maxYLow, Math.abs(low.positions[i + 1]));
      maxYHigh = Math.max(maxYHigh, Math.abs(high.positions[i + 1]));
    }
    expect(maxYHigh).toBeGreaterThan(maxYLow * 1.5);
  });

  it('T-076-G14: result does NOT contain edgeCount (no wireframe edges)', () => {
    const result = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 5000, seed: 'no-edges' });
    expect(result).not.toHaveProperty('edgeCount');
  });

  it('T-076-G15: supports tier-appropriate grid sizes (pointCount = rows*cols)', () => {
    const tierGrids = [
      { tier: 'low', rows: 80, cols: 120, expected: 80 * 120 },
      { tier: 'medium', rows: 150, cols: 200, expected: 150 * 200 },
      { tier: 'high', rows: 250, cols: 350, expected: 250 * 350 },
    ];
    for (const { tier, rows, cols, expected } of tierGrids) {
      const result = generateTerrainParticleSheet({
        rows, cols, pointCount: 999, seed: `tier-${tier}`,
      });
      expect(result.pointCount, `${tier} tier pointCount`).toBe(expected);
      expect(result.positions.length, `${tier} tier positions length`).toBe(expected * 3);
    }
  });

  it('T-076-G16: small grid is clamped to minimum 10x10 and distributes points across full extent', () => {
    const result = generateTerrainParticleSheet({
      rows: 4, cols: 4, pointCount: 5000, seed: 'dense-small',
    });
    // rows and cols are clamped to minimum 10, so pointCount = 10*10 = 100
    expect(result.pointCount).toBe(100);
    // Points should still span the grid
    let minX = Infinity, maxX = -Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      const x = result.positions[i];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
    expect(maxX - minX).toBeGreaterThan(5);
  });

  it('T-076-G17: default width/depth/heightScale produce valid output', () => {
    const result = generateTerrainParticleSheet({ rows: 10, cols: 10, pointCount: 1000, seed: 'defaults' });
    expect(result.pointCount).toBeGreaterThan(0);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.randoms.length).toBeGreaterThan(0);
  });
});

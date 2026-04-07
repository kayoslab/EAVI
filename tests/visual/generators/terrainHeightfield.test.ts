import { describe, it, expect } from 'vitest';
import { generateTerrainHeightfield } from '../../../src/visual/generators/terrainHeightfield';

describe('US-073: Wireframe terrain heightfield generator', () => {
  it('T-073-01: edge count equals rows*(cols+1) + cols*(rows+1) for multiple grid sizes', () => {
    const sizes = [
      { rows: 4, cols: 6 },
      { rows: 10, cols: 10 },
      { rows: 20, cols: 30 },
    ];
    for (const { rows, cols } of sizes) {
      const result = generateTerrainHeightfield({ rows, cols, seed: 'edge-count' });
      const expectedEdges = rows * (cols + 1) + cols * (rows + 1);
      expect(result.edgeCount).toBe(expectedEdges);
    }
  });

  it('T-073-02: positions array length equals edgeCount * 2 * 3', () => {
    const result = generateTerrainHeightfield({ rows: 8, cols: 12, seed: 'pos-len' });
    expect(result.positions.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-073-03: randoms array length equals edgeCount * 2 * 3', () => {
    const result = generateTerrainHeightfield({ rows: 8, cols: 12, seed: 'rand-len' });
    expect(result.randoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-073-04: output arrays are Float32Array instances', () => {
    const result = generateTerrainHeightfield({ rows: 5, cols: 5, seed: 'type-check' });
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.randoms).toBeInstanceOf(Float32Array);
  });

  it('T-073-05: all position values are finite', () => {
    const result = generateTerrainHeightfield({ rows: 15, cols: 20, seed: 'finite-pos' });
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it('T-073-06: all random values are finite and in [0, 1)', () => {
    const result = generateTerrainHeightfield({ rows: 15, cols: 20, seed: 'finite-rand' });
    for (let i = 0; i < result.randoms.length; i++) {
      const v = result.randoms[i];
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('T-073-07: output is deterministic — same seed and params produce identical positions', () => {
    const a = generateTerrainHeightfield({ rows: 10, cols: 15, seed: 'det-test' });
    const b = generateTerrainHeightfield({ rows: 10, cols: 15, seed: 'det-test' });

    expect(a.edgeCount).toBe(b.edgeCount);
    expect(a.rows).toBe(b.rows);
    expect(a.cols).toBe(b.cols);
    expect(a.positions).toEqual(b.positions);
    expect(a.randoms).toEqual(b.randoms);
  });

  it('T-073-08: different seeds produce different positions', () => {
    const a = generateTerrainHeightfield({ rows: 10, cols: 10, seed: 'seed-alpha' });
    const b = generateTerrainHeightfield({ rows: 10, cols: 10, seed: 'seed-beta' });

    let diffCount = 0;
    for (let i = 0; i < a.positions.length; i++) {
      if (Math.abs(a.positions[i] - b.positions[i]) > 0.0001) {
        diffCount++;
      }
    }
    expect(diffCount).toBeGreaterThan(0);
  });

  it('T-073-09: heights (Y values) are not all zero — terrain has visible hills and valleys', () => {
    const result = generateTerrainHeightfield({ rows: 20, cols: 20, seed: 'hills' });
    let nonZeroCount = 0;
    // Y values are at indices 1, 4 within each vertex (stride 3), two vertices per edge (stride 6)
    for (let i = 0; i < result.positions.length; i += 3) {
      if (Math.abs(result.positions[i + 1]) > 0.001) {
        nonZeroCount++;
      }
    }
    expect(nonZeroCount).toBeGreaterThan(0);
  });

  it('T-073-10: height range is meaningful — min Y !== max Y', () => {
    const result = generateTerrainHeightfield({ rows: 20, cols: 20, seed: 'range-test', heightScale: 2.0 });
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < result.positions.length; i += 3) {
      const y = result.positions[i + 1];
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const range = maxY - minY;
    expect(range).toBeGreaterThan(0.1);
  });

  it('T-073-11: grid extents — X positions span approximately [-width/2, width/2]', () => {
    const width = 10;
    const depth = 10;
    const result = generateTerrainHeightfield({ rows: 10, cols: 10, seed: 'extents', width, depth });
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
    expect(minX).toBeCloseTo(-width / 2, 1);
    expect(maxX).toBeCloseTo(width / 2, 1);
    expect(minZ).toBeCloseTo(-depth / 2, 1);
    expect(maxZ).toBeCloseTo(depth / 2, 1);
  });

  it('T-073-12: result contains correct rows and cols fields', () => {
    const result = generateTerrainHeightfield({ rows: 12, cols: 18, seed: 'meta' });
    expect(result.rows).toBe(12);
    expect(result.cols).toBe(18);
  });

  it('T-073-13: heightScale parameter controls amplitude of Y displacement', () => {
    const low = generateTerrainHeightfield({ rows: 15, cols: 15, seed: 'scale', heightScale: 1.0 });
    const high = generateTerrainHeightfield({ rows: 15, cols: 15, seed: 'scale', heightScale: 4.0 });

    let maxYLow = -Infinity, maxYHigh = -Infinity;
    for (let i = 0; i < low.positions.length; i += 3) {
      maxYLow = Math.max(maxYLow, Math.abs(low.positions[i + 1]));
      maxYHigh = Math.max(maxYHigh, Math.abs(high.positions[i + 1]));
    }
    expect(maxYHigh).toBeGreaterThan(maxYLow * 1.5);
  });

  it('T-073-14: default parameters produce valid output', () => {
    const result = generateTerrainHeightfield({ rows: 10, cols: 10, seed: 'defaults' });
    expect(result.edgeCount).toBeGreaterThan(0);
    expect(result.positions.length).toBeGreaterThan(0);
    expect(result.randoms.length).toBeGreaterThan(0);
  });

  it('T-073-15: small grid (2x2) produces correct minimal structure', () => {
    const result = generateTerrainHeightfield({ rows: 2, cols: 2, seed: 'small' });
    // Horizontal edges: cols * (rows+1) = 2*3 = 6
    // Vertical edges: rows * (cols+1) = 2*3 = 6
    // Total = 12
    expect(result.edgeCount).toBe(12);
    expect(result.positions.length).toBe(12 * 2 * 3);
    expect(result.randoms.length).toBe(12 * 2 * 3);
  });
});

import { describe, it, expect } from 'vitest';
import { generateCubeLattice } from '../../../src/visual/generators/cubeLattice';

/**
 * US-070: Tests for cubeLattice generator cell transform exports.
 *
 * The generator must expose per-alive-cell offsets and cell scale
 * so the occluder InstancedMesh can match the lattice wireframe.
 */
describe('US-070: cubeLattice generator cell transforms', () => {
  it('T-070-65: result includes cellOffsets Float32Array', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(result.cellOffsets).toBeInstanceOf(Float32Array);
  });

  it('T-070-66: result includes cellScale number', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0 });
    expect(typeof result.cellScale).toBe('number');
    expect(result.cellScale).toBeGreaterThan(0);
  });

  it('T-070-67: cellOffsets length is 3 * alive cell count', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0, voidDensity: 0 });
    // No voiding: all 27 cells alive
    expect(result.cellOffsets.length).toBe(27 * 3);
  });

  it('T-070-68: cellScale matches the provided cellSize', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 0.8 });
    expect(result.cellScale).toBeCloseTo(0.8, 5);
  });

  it('T-070-69: voiding reduces cellOffsets count', () => {
    const noVoid = generateCubeLattice({ gridSize: 3, cellSize: 1.0, voidDensity: 0, seed: 'void-test' });
    const withVoid = generateCubeLattice({ gridSize: 3, cellSize: 1.0, voidDensity: 0.5, seed: 'void-test' });
    expect(withVoid.cellOffsets.length).toBeLessThan(noVoid.cellOffsets.length);
  });

  it('T-070-70: all cellOffsets values are finite', () => {
    const result = generateCubeLattice({ gridSize: 4, cellSize: 1.0, seed: 'finite-cells' });
    for (let i = 0; i < result.cellOffsets.length; i++) {
      expect(isFinite(result.cellOffsets[i])).toBe(true);
    }
  });

  it('T-070-71: cellOffsets are centered (mean offset close to 0)', () => {
    const result = generateCubeLattice({ gridSize: 3, cellSize: 1.0, voidDensity: 0 });
    const n = result.cellOffsets.length / 3;
    let sx = 0, sy = 0, sz = 0;
    for (let i = 0; i < n; i++) {
      sx += result.cellOffsets[i * 3];
      sy += result.cellOffsets[i * 3 + 1];
      sz += result.cellOffsets[i * 3 + 2];
    }
    expect(Math.abs(sx / n)).toBeLessThan(0.01);
    expect(Math.abs(sy / n)).toBeLessThan(0.01);
    expect(Math.abs(sz / n)).toBeLessThan(0.01);
  });

  it('T-070-72: deterministic — same seed produces same cell transforms', () => {
    const opts = { gridSize: 3, cellSize: 1.0, seed: 'det-cell', voidDensity: 0.3 };
    const r1 = generateCubeLattice(opts);
    const r2 = generateCubeLattice(opts);
    expect(r1.cellOffsets).toEqual(r2.cellOffsets);
    expect(r1.cellScale).toBe(r2.cellScale);
  });
});

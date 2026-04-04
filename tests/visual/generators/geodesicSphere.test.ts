import { describe, it, expect } from 'vitest';
import {
  generateGeodesicEdges,
  maxGeodesicLevel,
} from '../../../src/visual/generators/geodesicSphere';

describe('US-062: Geodesic sphere generator', () => {
  // --- Edge count formula: 30 * (level+1)^2 ---
  // Three.js IcosahedronGeometry uses linear subdivision, not recursive.

  it('T-062-12: level 1 produces 120 edges (30 * 2^2)', () => {
    const result = generateGeodesicEdges({ level: 1, seed: 'geo-1' });
    expect(result.edgeCount).toBe(120);
  });

  it('T-062-13: level 2 produces 270 edges (30 * 3^2)', () => {
    const result = generateGeodesicEdges({ level: 2, seed: 'geo-2' });
    expect(result.edgeCount).toBe(270);
  });

  it('T-062-14: level 3 produces 480 edges (30 * 4^2)', () => {
    const result = generateGeodesicEdges({ level: 3, seed: 'geo-3' });
    expect(result.edgeCount).toBe(480);
  });

  it('T-062-15: level 4 produces 750 edges (30 * 5^2)', () => {
    const result = generateGeodesicEdges({ level: 4, seed: 'geo-4' });
    expect(result.edgeCount).toBe(750);
  });

  // --- Output format matches PolyhedronEdgeData ---

  it('T-062-16: positions length equals edgeCount * 2 * 3', () => {
    for (let level = 1; level <= 4; level++) {
      const result = generateGeodesicEdges({ level, seed: `fmt-${level}` });
      expect(result.positions.length).toBe(result.edgeCount * 2 * 3);
    }
  });

  it('T-062-17: randoms length equals edgeCount * 2 * 3', () => {
    for (let level = 1; level <= 3; level++) {
      const result = generateGeodesicEdges({ level, seed: `rnd-${level}` });
      expect(result.randoms.length).toBe(result.edgeCount * 2 * 3);
    }
  });

  it('T-062-18: positions are Float32Array', () => {
    const result = generateGeodesicEdges({ level: 1, seed: 'type-pos' });
    expect(result.positions).toBeInstanceOf(Float32Array);
  });

  it('T-062-19: randoms are Float32Array', () => {
    const result = generateGeodesicEdges({ level: 1, seed: 'type-rnd' });
    expect(result.randoms).toBeInstanceOf(Float32Array);
  });

  // --- Finiteness ---

  it('T-062-20: all positions are finite', () => {
    const result = generateGeodesicEdges({ level: 2, seed: 'finite-pos' });
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i]), `position[${i}]`).toBe(true);
    }
  });

  it('T-062-21: all randoms are finite and in [0, 1)', () => {
    const result = generateGeodesicEdges({ level: 2, seed: 'finite-rnd' });
    for (let i = 0; i < result.randoms.length; i++) {
      expect(Number.isFinite(result.randoms[i]), `random[${i}]`).toBe(true);
      expect(result.randoms[i]).toBeGreaterThanOrEqual(0);
      expect(result.randoms[i]).toBeLessThan(1);
    }
  });

  // --- Custom radius ---

  it('T-062-22: custom radius scales vertex positions', () => {
    const small = generateGeodesicEdges({ level: 1, radius: 0.1, seed: 'r-small' });
    const large = generateGeodesicEdges({ level: 1, radius: 1.0, seed: 'r-large' });
    // Compute max distance from origin for each
    let maxSmall = 0;
    let maxLarge = 0;
    for (let i = 0; i < small.positions.length; i += 3) {
      const d = Math.sqrt(small.positions[i] ** 2 + small.positions[i + 1] ** 2 + small.positions[i + 2] ** 2);
      maxSmall = Math.max(maxSmall, d);
    }
    for (let i = 0; i < large.positions.length; i += 3) {
      const d = Math.sqrt(large.positions[i] ** 2 + large.positions[i + 1] ** 2 + large.positions[i + 2] ** 2);
      maxLarge = Math.max(maxLarge, d);
    }
    expect(maxLarge).toBeGreaterThan(maxSmall * 5);
  });

  // --- Determinism ---

  it('T-062-23: same seed produces identical output', () => {
    const a = generateGeodesicEdges({ level: 2, seed: 'determ' });
    const b = generateGeodesicEdges({ level: 2, seed: 'determ' });
    expect(a.edgeCount).toBe(b.edgeCount);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.randoms)).toEqual(Array.from(b.randoms));
  });

  // --- maxGeodesicLevel helper ---

  // maxGeodesicLevel uses formula 30*(level+1)^2:
  // level 0: 30, level 1: 120, level 2: 270, level 3: 480, level 4: 750

  it('T-062-24: maxGeodesicLevel(120) returns 1', () => {
    expect(maxGeodesicLevel(120)).toBe(1);
  });

  it('T-062-25: maxGeodesicLevel(270) returns 2', () => {
    expect(maxGeodesicLevel(270)).toBe(2);
  });

  it('T-062-26: maxGeodesicLevel(300) returns 2 (budget between levels)', () => {
    expect(maxGeodesicLevel(300)).toBe(2);
  });

  it('T-062-27: maxGeodesicLevel(480) returns 3', () => {
    expect(maxGeodesicLevel(480)).toBe(3);
  });

  it('T-062-28: maxGeodesicLevel(500) returns 3', () => {
    expect(maxGeodesicLevel(500)).toBe(3);
  });

  it('T-062-29: maxGeodesicLevel(750) returns 4', () => {
    expect(maxGeodesicLevel(750)).toBe(4);
  });

  it('T-062-30: maxGeodesicLevel(119) returns 0 (below level 1 budget)', () => {
    expect(maxGeodesicLevel(119)).toBe(0);
  });

  it('T-062-31: maxGeodesicLevel(30) returns 0 (exact level 0 edge count)', () => {
    expect(maxGeodesicLevel(30)).toBe(0);
  });

  it('T-062-32: maxGeodesicLevel never returns above 4', () => {
    expect(maxGeodesicLevel(100000)).toBe(4);
  });
});

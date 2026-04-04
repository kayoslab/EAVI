import { describe, it, expect } from 'vitest';
import { generateDualEdges } from '../../../src/visual/generators/dualPolyhedra';
import type { PolyhedronShape } from '../../../src/visual/generators/polyhedraEdges';

describe('US-062: Dual polyhedra generator', () => {
  // --- Dual pair edge counts ---
  // icosahedron (30) + dodecahedron (30) = 60
  // cube (12) + octahedron (12) = 24
  // tetrahedron (6) + tetrahedron (6) = 12

  it('T-062-44: icosahedron dual produces 60 edges (icosa 30 + dodeca 30)', () => {
    const result = generateDualEdges({ shape: 'icosahedron', seed: 'dual-icosa' });
    expect(result.edgeCount).toBe(60);
  });

  it('T-062-45: dodecahedron dual produces 60 edges (dodeca 30 + icosa 30)', () => {
    const result = generateDualEdges({ shape: 'dodecahedron', seed: 'dual-dodeca' });
    expect(result.edgeCount).toBe(60);
  });

  it('T-062-46: octahedron dual produces 24 edges (octa 12 + cube 12)', () => {
    const result = generateDualEdges({ shape: 'octahedron', seed: 'dual-octa' });
    expect(result.edgeCount).toBe(24);
  });

  it('T-062-47: tetrahedron dual produces 12 edges (tetra 6 + tetra 6, self-dual)', () => {
    const result = generateDualEdges({ shape: 'tetrahedron', seed: 'dual-tetra' });
    expect(result.edgeCount).toBe(12);
  });

  // --- Output format ---

  it('T-062-48: positions length equals edgeCount * 2 * 3 for each dual pair', () => {
    const shapes: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];
    for (const shape of shapes) {
      const result = generateDualEdges({ shape, seed: `fmt-${shape}` });
      expect(result.positions.length).toBe(result.edgeCount * 2 * 3);
    }
  });

  it('T-062-49: randoms length equals edgeCount * 2 * 3', () => {
    const result = generateDualEdges({ shape: 'icosahedron', seed: 'rnd-fmt' });
    expect(result.randoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-062-50: positions and randoms are Float32Array', () => {
    const result = generateDualEdges({ shape: 'octahedron', seed: 'type' });
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.randoms).toBeInstanceOf(Float32Array);
  });

  // --- Both shapes present ---

  it('T-062-51: icosahedron dual output contains vertices from two distinct shapes', () => {
    const result = generateDualEdges({ shape: 'icosahedron', seed: 'two-shapes' });
    // Icosahedron has 12 unique vertices, dodecahedron has 20 unique vertices
    // Collect unique vertex positions (rounded to avoid float issues)
    const uniqueVerts = new Set<string>();
    for (let i = 0; i < result.positions.length; i += 3) {
      const key = [
        Math.round(result.positions[i] * 10000),
        Math.round(result.positions[i + 1] * 10000),
        Math.round(result.positions[i + 2] * 10000),
      ].join(',');
      uniqueVerts.add(key);
    }
    // Combined unique vertices should exceed either individual shape's vertex count
    // Icosahedron: 12 vertices, Dodecahedron: 20 vertices, combined: 32
    expect(uniqueVerts.size).toBeGreaterThan(12);
  });

  it('T-062-52: tetrahedron self-dual has two distinct scaled vertex sets', () => {
    const result = generateDualEdges({ shape: 'tetrahedron', seed: 'self-dual' });
    // Two tetrahedra at same radius but second is dual (different rotation/scale)
    // Should have more unique vertices than a single tetrahedron (4 verts)
    const uniqueVerts = new Set<string>();
    for (let i = 0; i < result.positions.length; i += 3) {
      const key = [
        Math.round(result.positions[i] * 10000),
        Math.round(result.positions[i + 1] * 10000),
        Math.round(result.positions[i + 2] * 10000),
      ].join(',');
      uniqueVerts.add(key);
    }
    expect(uniqueVerts.size).toBeGreaterThan(4);
  });

  // --- Finiteness ---

  it('T-062-53: all positions are finite for all dual pairs', () => {
    const shapes: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];
    for (const shape of shapes) {
      const result = generateDualEdges({ shape, seed: `fin-${shape}` });
      for (let i = 0; i < result.positions.length; i++) {
        expect(Number.isFinite(result.positions[i]), `${shape} position[${i}]`).toBe(true);
      }
    }
  });

  it('T-062-54: all randoms are finite and in [0, 1)', () => {
    const result = generateDualEdges({ shape: 'icosahedron', seed: 'fin-rnd' });
    for (let i = 0; i < result.randoms.length; i++) {
      expect(Number.isFinite(result.randoms[i])).toBe(true);
      expect(result.randoms[i]).toBeGreaterThanOrEqual(0);
      expect(result.randoms[i]).toBeLessThan(1);
    }
  });

  // --- Determinism ---

  it('T-062-55: same seed produces identical output', () => {
    const a = generateDualEdges({ shape: 'icosahedron', seed: 'det' });
    const b = generateDualEdges({ shape: 'icosahedron', seed: 'det' });
    expect(a.edgeCount).toBe(b.edgeCount);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.randoms)).toEqual(Array.from(b.randoms));
  });

  // --- Custom radius ---

  it('T-062-56: custom radius scales both shapes', () => {
    const small = generateDualEdges({ shape: 'octahedron', radius: 0.1, seed: 'r' });
    const large = generateDualEdges({ shape: 'octahedron', radius: 1.0, seed: 'r' });
    let maxSmall = 0;
    let maxLarge = 0;
    for (let i = 0; i < small.positions.length; i += 3) {
      maxSmall = Math.max(maxSmall, Math.sqrt(small.positions[i] ** 2 + small.positions[i + 1] ** 2 + small.positions[i + 2] ** 2));
    }
    for (let i = 0; i < large.positions.length; i += 3) {
      maxLarge = Math.max(maxLarge, Math.sqrt(large.positions[i] ** 2 + large.positions[i + 1] ** 2 + large.positions[i + 2] ** 2));
    }
    expect(maxLarge).toBeGreaterThan(maxSmall * 5);
  });
});

import { describe, it, expect } from 'vitest';
import { generateNestedEdges } from '../../../src/visual/generators/nestedSolids';
import { generatePolyhedronEdges } from '../../../src/visual/generators/polyhedraEdges';
import type { PolyhedronShape } from '../../../src/visual/generators/polyhedraEdges';

describe('US-062: Nested solids generator', () => {
  const shapes: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];

  // --- Edge count = base edges * layers ---

  it('T-062-33: 2-layer icosahedron has 2x the base edge count', () => {
    const base = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'base' });
    const nested = generateNestedEdges({ shape: 'icosahedron', layers: 2, seed: 'nested-2' });
    expect(nested.edgeCount).toBe(base.edgeCount * 2);
  });

  it('T-062-34: 3-layer octahedron has 3x the base edge count', () => {
    const base = generatePolyhedronEdges({ shape: 'octahedron', seed: 'base' });
    const nested = generateNestedEdges({ shape: 'octahedron', layers: 3, seed: 'nested-3' });
    expect(nested.edgeCount).toBe(base.edgeCount * 3);
  });

  it('T-062-35: 4-layer dodecahedron has 4x the base edge count', () => {
    const base = generatePolyhedronEdges({ shape: 'dodecahedron', seed: 'base' });
    const nested = generateNestedEdges({ shape: 'dodecahedron', layers: 4, seed: 'nested-4' });
    expect(nested.edgeCount).toBe(base.edgeCount * 4);
  });

  it('T-062-36: edge count formula holds for all shapes at 2 layers', () => {
    for (const shape of shapes) {
      const base = generatePolyhedronEdges({ shape, seed: 'base-check' });
      const nested = generateNestedEdges({ shape, layers: 2, seed: 'check-2' });
      expect(nested.edgeCount).toBe(base.edgeCount * 2);
    }
  });

  // --- Output format ---

  it('T-062-37: positions length equals edgeCount * 2 * 3', () => {
    const result = generateNestedEdges({ shape: 'icosahedron', layers: 3, seed: 'fmt' });
    expect(result.positions.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-062-38: randoms length equals edgeCount * 2 * 3', () => {
    const result = generateNestedEdges({ shape: 'icosahedron', layers: 3, seed: 'rnd-fmt' });
    expect(result.randoms.length).toBe(result.edgeCount * 2 * 3);
  });

  it('T-062-39: positions and randoms are Float32Array', () => {
    const result = generateNestedEdges({ shape: 'tetrahedron', layers: 2, seed: 'type' });
    expect(result.positions).toBeInstanceOf(Float32Array);
    expect(result.randoms).toBeInstanceOf(Float32Array);
  });

  // --- Multiple radii ---

  it('T-062-40: nested layers span multiple distinct radii', () => {
    const result = generateNestedEdges({ shape: 'icosahedron', layers: 3, radius: 0.3, seed: 'radii' });
    // Collect max vertex distance per edge group
    const base = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'base' });
    const vertsPerLayer = base.edgeCount * 2;
    const maxDistances = new Set<number>();
    for (let layer = 0; layer < 3; layer++) {
      let maxDist = 0;
      for (let v = 0; v < vertsPerLayer; v++) {
        const idx = (layer * vertsPerLayer + v) * 3;
        const d = Math.sqrt(
          result.positions[idx] ** 2 +
          result.positions[idx + 1] ** 2 +
          result.positions[idx + 2] ** 2
        );
        maxDist = Math.max(maxDist, d);
      }
      maxDistances.add(Math.round(maxDist * 1000));
    }
    // Should have 3 distinct radii
    expect(maxDistances.size).toBe(3);
  });

  // --- Finiteness ---

  it('T-062-41: all positions are finite', () => {
    const result = generateNestedEdges({ shape: 'icosahedron', layers: 4, seed: 'finite' });
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i]), `position[${i}]`).toBe(true);
    }
  });

  it('T-062-42: all randoms are finite and in [0, 1)', () => {
    const result = generateNestedEdges({ shape: 'octahedron', layers: 3, seed: 'finite-r' });
    for (let i = 0; i < result.randoms.length; i++) {
      expect(Number.isFinite(result.randoms[i])).toBe(true);
      expect(result.randoms[i]).toBeGreaterThanOrEqual(0);
      expect(result.randoms[i]).toBeLessThan(1);
    }
  });

  // --- Determinism ---

  it('T-062-43: same seed and parameters produce identical output', () => {
    const a = generateNestedEdges({ shape: 'icosahedron', layers: 3, seed: 'det' });
    const b = generateNestedEdges({ shape: 'icosahedron', layers: 3, seed: 'det' });
    expect(a.edgeCount).toBe(b.edgeCount);
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.randoms)).toEqual(Array.from(b.randoms));
  });
});

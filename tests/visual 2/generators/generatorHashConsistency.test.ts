import { describe, it, expect } from 'vitest';
import { hashRandomFromPosition } from '../../../src/visual/generators/subdivideEdges';
import { generateGeodesicEdges } from '../../../src/visual/generators/geodesicSphere';
import { generateNestedEdges } from '../../../src/visual/generators/nestedSolids';
import { generateDualEdges } from '../../../src/visual/generators/dualPolyhedra';
import type { PolyhedronEdgeData } from '../../../src/visual/generators/polyhedraEdges';

function verifyPositionBasedRandoms(label: string, data: PolyhedronEdgeData): void {
  const vertCount = data.edgeCount * 2;
  for (let i = 0; i < vertCount; i++) {
    const x = data.positions[i * 3];
    const y = data.positions[i * 3 + 1];
    const z = data.positions[i * 3 + 2];
    const [r0, r1, r2] = hashRandomFromPosition(x, y, z);
    expect(data.randoms[i * 3], `${label} vertex ${i} r0`).toBeCloseTo(r0, 5);
    expect(data.randoms[i * 3 + 1], `${label} vertex ${i} r1`).toBeCloseTo(r1, 5);
    expect(data.randoms[i * 3 + 2], `${label} vertex ${i} r2`).toBeCloseTo(r2, 5);
  }
}

describe('US-065: All generators use position-based aRandom hashing', () => {
  it('T-065-26: geodesicSphere randoms match hashRandomFromPosition', () => {
    const data = generateGeodesicEdges({ level: 1, seed: 'geo-hash-test' });
    verifyPositionBasedRandoms('geodesic', data);
  });

  it('T-065-27: nestedSolids randoms match hashRandomFromPosition', () => {
    const data = generateNestedEdges({ shape: 'icosahedron', layers: 2, seed: 'nested-hash-test' });
    verifyPositionBasedRandoms('nested', data);
  });

  it('T-065-28: dualPolyhedra randoms match hashRandomFromPosition', () => {
    const data = generateDualEdges({ shape: 'icosahedron', seed: 'dual-hash-test' });
    verifyPositionBasedRandoms('dual', data);
  });

  it('T-065-29: geodesicSphere shared vertices have identical aRandom values', () => {
    const data = generateGeodesicEdges({ level: 2, seed: 'geo-dedup-test' });
    const posToRandoms = new Map<string, number[]>();
    const vertCount = data.edgeCount * 2;
    let duplicateCount = 0;
    for (let i = 0; i < vertCount; i++) {
      const key = `${Math.round(data.positions[i * 3] * 1e6)},${Math.round(data.positions[i * 3 + 1] * 1e6)},${Math.round(data.positions[i * 3 + 2] * 1e6)}`;
      const randoms = [data.randoms[i * 3], data.randoms[i * 3 + 1], data.randoms[i * 3 + 2]];
      if (posToRandoms.has(key)) {
        duplicateCount++;
        const existing = posToRandoms.get(key)!;
        expect(randoms[0]).toBeCloseTo(existing[0], 5);
        expect(randoms[1]).toBeCloseTo(existing[1], 5);
        expect(randoms[2]).toBeCloseTo(existing[2], 5);
      } else {
        posToRandoms.set(key, randoms);
      }
    }
    // Geodesic level 2 has 270 edges = 540 endpoints but only 42 unique vertices
    expect(duplicateCount).toBeGreaterThan(0);
  });

  it('T-065-30: all generator randoms remain in [0, 1) range', () => {
    const generators = [
      generateGeodesicEdges({ level: 1, seed: 'range-geo' }),
      generateNestedEdges({ shape: 'octahedron', layers: 3, seed: 'range-nested' }),
      generateDualEdges({ shape: 'dodecahedron', seed: 'range-dual' }),
    ];
    for (const data of generators) {
      for (let i = 0; i < data.randoms.length; i++) {
        expect(data.randoms[i]).toBeGreaterThanOrEqual(0);
        expect(data.randoms[i]).toBeLessThan(1);
      }
    }
  });
});

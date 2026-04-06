import { describe, it, expect } from 'vitest';
import { extractUniqueVertices } from '../../../src/visual/generators/extractVertices';
import { hashRandomFromPosition } from '../../../src/visual/generators/subdivideEdges';
import { generatePolyhedronEdges } from '../../../src/visual/generators/polyhedraEdges';

// --- Helpers ---

/** Single edge from (0,0,0) to (1,0,0) — 2 vertices, 6 floats */
function singleEdge(): Float32Array {
  return new Float32Array([0, 0, 0, 1, 0, 0]);
}

/** Triangle edges: A-B, B-C, A-C sharing 3 unique vertices */
function triangleEdges(): Float32Array {
  // A=(0,0,0), B=(1,0,0), C=(0,1,0)
  return new Float32Array([
    0, 0, 0, 1, 0, 0,  // A-B
    1, 0, 0, 0, 1, 0,  // B-C
    0, 0, 0, 0, 1, 0,  // A-C
  ]);
}

describe('US-065: extractUniqueVertices', () => {
  it('T-065-01: returns correct vertexCount for a single edge (2 unique vertices)', () => {
    const result = extractUniqueVertices(singleEdge());
    expect(result.vertexCount).toBe(2);
  });

  it('T-065-02: deduplicates shared vertices in a triangle (3 edges → 3 unique vertices)', () => {
    const result = extractUniqueVertices(triangleEdges());
    expect(result.vertexCount).toBe(3);
  });

  it('T-065-03: positions array length equals vertexCount * 3', () => {
    const result = extractUniqueVertices(triangleEdges());
    expect(result.positions.length).toBe(result.vertexCount * 3);
  });

  it('T-065-04: aRandom array length equals vertexCount * 3', () => {
    const result = extractUniqueVertices(triangleEdges());
    expect(result.aRandom.length).toBe(result.vertexCount * 3);
  });

  it('T-065-05: positions output is a Float32Array', () => {
    const result = extractUniqueVertices(singleEdge());
    expect(result.positions).toBeInstanceOf(Float32Array);
  });

  it('T-065-06: aRandom output is a Float32Array', () => {
    const result = extractUniqueVertices(singleEdge());
    expect(result.aRandom).toBeInstanceOf(Float32Array);
  });

  it('T-065-07: all position values are finite', () => {
    const result = extractUniqueVertices(triangleEdges());
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isFinite(result.positions[i])).toBe(true);
    }
  });

  it('T-065-08: all aRandom values are finite and in [0, 1)', () => {
    const result = extractUniqueVertices(triangleEdges());
    for (let i = 0; i < result.aRandom.length; i++) {
      expect(Number.isFinite(result.aRandom[i])).toBe(true);
      expect(result.aRandom[i]).toBeGreaterThanOrEqual(0);
      expect(result.aRandom[i]).toBeLessThan(1);
    }
  });

  it('T-065-09: aRandom uses hashRandomFromPosition (matches shared helper output)', () => {
    const edge = singleEdge();
    const result = extractUniqueVertices(edge);
    // First vertex at (0,0,0)
    const [r0, r1, r2] = hashRandomFromPosition(0, 0, 0);
    expect(result.aRandom[0]).toBeCloseTo(r0, 5);
    expect(result.aRandom[1]).toBeCloseTo(r1, 5);
    expect(result.aRandom[2]).toBeCloseTo(r2, 5);
  });

  it('T-065-10: empty input returns zero-length arrays', () => {
    const result = extractUniqueVertices(new Float32Array(0));
    expect(result.vertexCount).toBe(0);
    expect(result.positions.length).toBe(0);
    expect(result.aRandom.length).toBe(0);
  });

  it('T-065-11: icosahedron edges (30 edges = 60 endpoints) yield exactly 12 unique vertices', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'ico-vertex-test' });
    const result = extractUniqueVertices(edgeData.positions);
    expect(result.vertexCount).toBe(12);
  });

  it('T-065-12: tetrahedron edges (6 edges = 12 endpoints) yield exactly 4 unique vertices', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'tetrahedron', seed: 'tet-vertex-test' });
    const result = extractUniqueVertices(edgeData.positions);
    expect(result.vertexCount).toBe(4);
  });

  it('T-065-13: octahedron edges (12 edges = 24 endpoints) yield exactly 6 unique vertices', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'octahedron', seed: 'oct-vertex-test' });
    const result = extractUniqueVertices(edgeData.positions);
    expect(result.vertexCount).toBe(6);
  });

  it('T-065-14: cube edges (12 edges = 24 endpoints) yield exactly 8 unique vertices', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'cube', seed: 'cube-vertex-test' });
    const result = extractUniqueVertices(edgeData.positions);
    expect(result.vertexCount).toBe(8);
  });

  it('T-065-15: dodecahedron edges (30 edges = 60 endpoints) yield exactly 20 unique vertices', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'dodecahedron', seed: 'dodec-vertex-test' });
    const result = extractUniqueVertices(edgeData.positions);
    expect(result.vertexCount).toBe(20);
  });

  it('T-065-16: extracted positions are a subset of input edge endpoint positions', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'subset-test' });
    const result = extractUniqueVertices(edgeData.positions);
    // Build set of input positions (rounded for comparison)
    const inputPosSet = new Set<string>();
    for (let i = 0; i < edgeData.positions.length; i += 3) {
      const key = `${Math.round(edgeData.positions[i] * 1e6)},${Math.round(edgeData.positions[i + 1] * 1e6)},${Math.round(edgeData.positions[i + 2] * 1e6)}`;
      inputPosSet.add(key);
    }
    for (let i = 0; i < result.positions.length; i += 3) {
      const key = `${Math.round(result.positions[i] * 1e6)},${Math.round(result.positions[i + 1] * 1e6)},${Math.round(result.positions[i + 2] * 1e6)}`;
      expect(inputPosSet.has(key), `extracted vertex not found in input: ${key}`).toBe(true);
    }
  });

  it('T-065-17: deterministic — same input produces same output', () => {
    const edgeData = generatePolyhedronEdges({ shape: 'icosahedron', seed: 'det-test' });
    const a = extractUniqueVertices(edgeData.positions);
    const b = extractUniqueVertices(edgeData.positions);
    expect(a.vertexCount).toBe(b.vertexCount);
    for (let i = 0; i < a.positions.length; i++) {
      expect(a.positions[i]).toBe(b.positions[i]);
    }
    for (let i = 0; i < a.aRandom.length; i++) {
      expect(a.aRandom[i]).toBe(b.aRandom[i]);
    }
  });
});

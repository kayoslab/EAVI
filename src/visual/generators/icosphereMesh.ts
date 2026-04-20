import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

/**
 * Subdivided icosahedron mesh.
 * Starts with the golden-ratio icosahedron (12 vertices, 20 faces),
 * subdivides each triangle by splitting edges at midpoints,
 * then projects all vertices to a sphere and applies FBM radial displacement.
 */
export function generateIcosphereMesh(
  seed: string,
  rows: number,
  _cols: number,
  octaves: number,
): TriMeshGeometry {
  const radius = 2.5;
  const subdivisions = Math.max(2, Math.min(5, Math.round(rows / 20)));

  const rng = createPRNG(seed + ':icosphere-fbm');

  const octaveParams: { p1: number; p2: number; p3: number; p4: number; offset: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    octaveParams.push({
      p1: rng() * 100 + 10,
      p2: rng() * 100 + 10,
      p3: rng() * 100 + 10,
      p4: rng() * 100 + 10,
      offset: rng() * 1000,
    });
  }

  function fbm(x: number, y: number, z: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    for (let o = 0; o < octaves; o++) {
      const p = octaveParams[o];
      value +=
        amplitude *
        Math.sin(frequency * x * p.p1 + frequency * y * p.p2 + p.offset) *
        Math.cos(frequency * z * p.p3 + frequency * x * p.p4 + p.offset);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  // Golden ratio icosahedron base vertices
  const phi = (1 + Math.sqrt(5)) / 2;
  const baseVerts: [number, number, number][] = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];

  // Normalize base vertices to unit sphere
  for (const v of baseVerts) {
    const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    v[0] /= len;
    v[1] /= len;
    v[2] /= len;
  }

  // 20 base faces
  const baseFaces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];

  // Working arrays for subdivision
  let vertices: number[] = [];
  for (const v of baseVerts) {
    vertices.push(v[0], v[1], v[2]);
  }
  let faces: number[] = [];
  for (const f of baseFaces) {
    faces.push(f[0], f[1], f[2]);
  }

  // Subdivide
  for (let s = 0; s < subdivisions; s++) {
    const midpointCache = new Map<string, number>();
    const newFaces: number[] = [];

    function getMidpoint(a: number, b: number): number {
      const key = a < b ? `${a}_${b}` : `${b}_${a}`;
      const cached = midpointCache.get(key);
      if (cached !== undefined) return cached;

      const ax = vertices[a * 3], ay = vertices[a * 3 + 1], az = vertices[a * 3 + 2];
      const bx = vertices[b * 3], by = vertices[b * 3 + 1], bz = vertices[b * 3 + 2];
      let mx = (ax + bx) * 0.5;
      let my = (ay + by) * 0.5;
      let mz = (az + bz) * 0.5;

      // Project to unit sphere
      const len = Math.sqrt(mx * mx + my * my + mz * mz);
      mx /= len;
      my /= len;
      mz /= len;

      const idx = vertices.length / 3;
      vertices.push(mx, my, mz);
      midpointCache.set(key, idx);
      return idx;
    }

    const faceCount = faces.length / 3;
    for (let i = 0; i < faceCount; i++) {
      const a = faces[i * 3];
      const b = faces[i * 3 + 1];
      const c = faces[i * 3 + 2];

      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);

      newFaces.push(a, ab, ca);
      newFaces.push(b, bc, ab);
      newFaces.push(c, ca, bc);
      newFaces.push(ab, bc, ca);
    }

    faces = newFaces;
  }

  // Apply radius and FBM displacement
  const vertexCount = vertices.length / 3;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandoms = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const base = i * 3;
    const ux = vertices[base];
    const uy = vertices[base + 1];
    const uz = vertices[base + 2];

    const disp = fbm(ux * 3, uy * 3, uz * 3) * 0.3;
    const r = radius + disp;

    const x = ux * r;
    const y = uy * r;
    const z = uz * r;

    vertexPositions[base] = x;
    vertexPositions[base + 1] = y;
    vertexPositions[base + 2] = z;

    const rnd = hashRandomFromPosition(x, y, z);
    vertexRandoms[base] = rnd[0];
    vertexRandoms[base + 1] = rnd[1];
    vertexRandoms[base + 2] = rnd[2];
  }

  const triangleCount = faces.length / 3;
  const triangleIndices = new Uint32Array(faces);

  return { vertexPositions, vertexRandoms, triangleIndices, vertexCount, triangleCount };
}

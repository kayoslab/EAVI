import { createPRNG } from '../prng';
import type { QualityTier } from '../quality';
import { hashRandomFromPosition } from './subdivideEdges';

export type PolyhedronShape = 'icosahedron' | 'octahedron' | 'dodecahedron' | 'tetrahedron' | 'cube';

export type GenerationMode = 'plain' | 'geodesic' | 'nested' | 'dual';

const SHAPES: PolyhedronShape[] = ['icosahedron', 'octahedron', 'dodecahedron', 'tetrahedron'];

const GENERATION_MODES: GenerationMode[] = ['plain', 'geodesic', 'nested', 'dual'];

export interface PolyhedronEdgeData {
  positions: Float32Array;
  randoms: Float32Array;
  edgeCount: number;
}

export interface PolyhedronMesh {
  /** Unit-radius vertex positions, xyz interleaved. */
  vertices: Float32Array;
  /** Unique undirected edges as vertex index pairs. */
  edges: [number, number][];
}

export function selectGenerationMode(seed: string, tier: QualityTier): GenerationMode {
  if (tier === 'low') return 'plain';
  const rng = createPRNG(seed + ':genmode');
  const idx = Math.floor(rng() * GENERATION_MODES.length) % GENERATION_MODES.length;
  return GENERATION_MODES[idx];
}

const PHI = (1 + Math.sqrt(5)) / 2;

/** Canonical vertex tables, normalised to the unit sphere. */
function baseVertices(shape: PolyhedronShape): number[][] {
  switch (shape) {
    case 'tetrahedron':
      return [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
    case 'cube':
      return [
        [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
        [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1],
      ];
    case 'octahedron':
      return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    case 'icosahedron':
      return [
        [-1, PHI, 0], [1, PHI, 0], [-1, -PHI, 0], [1, -PHI, 0],
        [0, -1, PHI], [0, 1, PHI], [0, -1, -PHI], [0, 1, -PHI],
        [PHI, 0, -1], [PHI, 0, 1], [-PHI, 0, -1], [-PHI, 0, 1],
      ];
    case 'dodecahedron': {
      const inv = 1 / PHI;
      return [
        [-1, -1, -1], [-1, -1, 1], [-1, 1, -1], [-1, 1, 1],
        [1, -1, -1], [1, -1, 1], [1, 1, -1], [1, 1, 1],
        [0, -inv, -PHI], [0, -inv, PHI], [0, inv, -PHI], [0, inv, PHI],
        [-inv, -PHI, 0], [-inv, PHI, 0], [inv, -PHI, 0], [inv, PHI, 0],
        [-PHI, 0, -inv], [-PHI, 0, inv], [PHI, 0, -inv], [PHI, 0, inv],
      ];
    }
  }
}

/**
 * Regular polyhedron as unit-sphere vertices plus its edge list.
 * Edges of a regular polyhedron are exactly the vertex pairs at the minimum non-zero distance.
 */
export function createPolyhedronMesh(shape: PolyhedronShape): PolyhedronMesh {
  const raw = baseVertices(shape);
  const n = raw.length;
  const vertices = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const [x, y, z] = raw[i];
    const len = Math.hypot(x, y, z) || 1;
    vertices[i * 3] = x / len;
    vertices[i * 3 + 1] = y / len;
    vertices[i * 3 + 2] = z / len;
  }

  let minDist = Infinity;
  const dist = (a: number, b: number) =>
    Math.hypot(
      vertices[a * 3] - vertices[b * 3],
      vertices[a * 3 + 1] - vertices[b * 3 + 1],
      vertices[a * 3 + 2] - vertices[b * 3 + 2],
    );
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = dist(a, b);
      if (d > 1e-6 && d < minDist) minDist = d;
    }
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      if (Math.abs(dist(a, b) - minDist) < 1e-4) edges.push([a, b]);
    }
  }
  return { vertices, edges };
}

export function selectShape(seed: string): PolyhedronShape {
  const rng = createPRNG(seed);
  const idx = Math.floor(rng() * SHAPES.length) % SHAPES.length;
  return SHAPES[idx];
}

/** Pack an edge list into the line-segment layout (two vertices per edge) with per-vertex randoms. */
export function packEdges(vertices: Float32Array, edges: readonly [number, number][], radius: number): PolyhedronEdgeData {
  const edgeCount = edges.length;
  const vertCount = edgeCount * 2;
  const positions = new Float32Array(vertCount * 3);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = edges[e];
    const base = e * 6;
    positions[base] = vertices[a * 3] * radius;
    positions[base + 1] = vertices[a * 3 + 1] * radius;
    positions[base + 2] = vertices[a * 3 + 2] * radius;
    positions[base + 3] = vertices[b * 3] * radius;
    positions[base + 4] = vertices[b * 3 + 1] * radius;
    positions[base + 5] = vertices[b * 3 + 2] * radius;
  }
  const randoms = new Float32Array(vertCount * 3);
  for (let i = 0; i < vertCount; i++) {
    const [r0, r1, r2] = hashRandomFromPosition(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    randoms[i * 3] = r0;
    randoms[i * 3 + 1] = r1;
    randoms[i * 3 + 2] = r2;
  }
  return { positions, randoms, edgeCount };
}

export function generatePolyhedronEdges(opts: {
  shape: PolyhedronShape;
  radius?: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;
  const mesh = createPolyhedronMesh(opts.shape);
  return packEdges(mesh.vertices, mesh.edges, radius);
}

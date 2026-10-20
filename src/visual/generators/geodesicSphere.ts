import { createPolyhedronMesh, packEdges, type PolyhedronEdgeData } from './polyhedraEdges';

/**
 * Edge count for a geodesic sphere at a given subdivision level.
 * Linear subdivision of each icosahedron face into (level+1)^2 triangles gives 30 * (level+1)^2 edges.
 */
function geodesicEdgeCount(level: number): number {
  return 30 * (level + 1) * (level + 1);
}

/**
 * Returns the highest geodesic subdivision level where edge count <= maxEdges.
 * Capped at 4.
 */
export function maxGeodesicLevel(maxEdges: number): number {
  let level = 0;
  for (let l = 1; l <= 4; l++) {
    if (geodesicEdgeCount(l) <= maxEdges) {
      level = l;
    }
  }
  return level;
}

/** Icosahedron faces as index triples over the canonical 12-vertex table. */
function icosahedronFaces(edges: readonly [number, number][], vertexCount: number): [number, number, number][] {
  const adjacency: Set<number>[] = Array.from({ length: vertexCount }, () => new Set<number>());
  for (const [a, b] of edges) {
    adjacency[a].add(b);
    adjacency[b].add(a);
  }
  const faces: [number, number, number][] = [];
  for (let a = 0; a < vertexCount; a++) {
    for (const b of adjacency[a]) {
      if (b <= a) continue;
      for (const c of adjacency[b]) {
        if (c <= b || !adjacency[a].has(c)) continue;
        faces.push([a, b, c]);
      }
    }
  }
  return faces;
}

export function generateGeodesicEdges(opts: {
  radius?: number;
  level: number;
  seed: string;
}): PolyhedronEdgeData {
  const radius = opts.radius ?? 0.3;
  const level = Math.max(0, Math.min(4, Math.round(opts.level)));
  const n = level + 1;

  const ico = createPolyhedronMesh('icosahedron');
  const faces = icosahedronFaces(ico.edges, ico.vertices.length / 3);

  // Shared vertex pool keyed by quantised position so face borders dedupe.
  const keyToIndex = new Map<string, number>();
  const verts: number[] = [];
  const vertexIndex = (x: number, y: number, z: number): number => {
    const len = Math.hypot(x, y, z) || 1;
    const px = x / len;
    const py = y / len;
    const pz = z / len;
    const key = `${Math.round(px * 1e6)},${Math.round(py * 1e6)},${Math.round(pz * 1e6)}`;
    let idx = keyToIndex.get(key);
    if (idx === undefined) {
      idx = verts.length / 3;
      keyToIndex.set(key, idx);
      verts.push(px, py, pz);
    }
    return idx;
  };

  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  const addEdge = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo},${hi}`;
    if (edgeSet.has(key)) return;
    edgeSet.add(key);
    edges.push([lo, hi]);
  };

  const v = ico.vertices;
  for (const [ia, ib, ic] of faces) {
    const ax = v[ia * 3], ay = v[ia * 3 + 1], az = v[ia * 3 + 2];
    const bx = v[ib * 3], by = v[ib * 3 + 1], bz = v[ib * 3 + 2];
    const cx = v[ic * 3], cy = v[ic * 3 + 1], cz = v[ic * 3 + 2];
    // Grid of (i, j) with i + j <= n; rows of the triangle lattice.
    const grid: number[][] = [];
    for (let i = 0; i <= n; i++) {
      grid.push([]);
      for (let j = 0; j <= n - i; j++) {
        const u = i / n;
        const w = j / n;
        const t = 1 - u - w;
        grid[i].push(vertexIndex(
          ax * t + bx * u + cx * w,
          ay * t + by * u + cy * w,
          az * t + bz * u + cz * w,
        ));
      }
    }
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n - i; j++) {
        const p = grid[i][j];
        const q = grid[i + 1][j];
        const r = grid[i][j + 1];
        addEdge(p, q);
        addEdge(p, r);
        addEdge(q, r);
      }
    }
  }

  return packEdges(Float32Array.from(verts), edges, radius);
}

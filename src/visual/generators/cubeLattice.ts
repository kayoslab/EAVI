/**
 * Cube lattice generator.
 * Produces an NxNxN grid of cube wireframes with shared/merged vertices
 * at adjacent cube boundaries. Adjacent cubes share edges and vertices
 * to avoid duplication.
 *
 * US-072: Adds seeded vertex jitter, noise-driven cell voiding,
 * vertex compaction, and connectivity tracking.
 */

import { hashRandomFromPosition } from './subdivideEdges';
import { createPRNG } from '../prng';

export interface CubeLatticeVertexData {
  positions: Float32Array;
  aRandom: Float32Array;
  connectivity: Float32Array;
  vertexCount: number;
}

export interface CubeLatticeEdgeData {
  positions: Float32Array;
  randoms: Float32Array;
  edgeCount: number;
}

export interface CubeLatticeResult {
  vertices: CubeLatticeVertexData;
  edges: CubeLatticeEdgeData;
  cellOffsets: Float32Array;
  cellScale: number;
}

/**
 * Generate an NxNxN grid of cube wireframes with merged vertices and edges.
 *
 * Unique vertices = (N+1)^3
 * Unique edges = 3 * N * (N+1)^2
 *
 * The lattice is centered at origin.
 */
export function generateCubeLattice(opts: {
  gridSize: number;
  cellSize: number;
  seed?: string;
  jitter?: number;
  voidDensity?: number;
}): CubeLatticeResult {
  const { gridSize: N, cellSize, seed, jitter = 0, voidDensity = 0 } = opts;

  // --- Vertices ---
  const side = N + 1;
  const vertexCount = side * side * side;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandom = new Float32Array(vertexCount * 3);

  // Center offset so the lattice is centered at origin
  const offset = (N * cellSize) / 2;

  // PRNG for jitter (only used when jitter > 0 and seed is provided)
  const jitterRng = seed && jitter > 0 ? createPRNG(seed + '-lattice-jitter') : null;

  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < side; ix++) {
        const idx = (iz * side * side + iy * side + ix) * 3;
        let x = ix * cellSize - offset;
        let y = iy * cellSize - offset;
        let z = iz * cellSize - offset;

        // Apply seeded jitter to break grid uniformity
        if (jitterRng) {
          const maxDisp = jitter * 0.35 * cellSize;
          x += (jitterRng() - 0.5) * 2 * maxDisp;
          y += (jitterRng() - 0.5) * 2 * maxDisp;
          z += (jitterRng() - 0.5) * 2 * maxDisp;
        }

        vertexPositions[idx] = x;
        vertexPositions[idx + 1] = y;
        vertexPositions[idx + 2] = z;

        const [r0, r1, r2] = hashRandomFromPosition(x, y, z);
        vertexRandom[idx] = r0;
        vertexRandom[idx + 1] = r1;
        vertexRandom[idx + 2] = r2;
      }
    }
  }

  // --- Cell voiding mask ---
  // Boolean array for NxNxN cells. A voided cell removes edges that only border voided cells.
  const cellCount = N * N * N;
  const cellAlive = new Uint8Array(cellCount);
  const voidRng = seed && voidDensity > 0 ? createPRNG(seed + '-lattice-void') : null;

  for (let i = 0; i < cellCount; i++) {
    if (voidRng) {
      cellAlive[i] = voidRng() >= voidDensity ? 1 : 0;
    } else {
      cellAlive[i] = 1;
    }
  }

  function cellIndex(cx: number, cy: number, cz: number): number {
    return cz * N * N + cy * N + cx;
  }

  function isCellAlive(cx: number, cy: number, cz: number): boolean {
    if (cx < 0 || cx >= N || cy < 0 || cy >= N || cz < 0 || cz >= N) return false;
    return cellAlive[cellIndex(cx, cy, cz)] === 1;
  }

  // --- Edges ---
  // Collect edges as pairs of vertex indices, filtering by cell adjacency
  function vertexIndex(ix: number, iy: number, iz: number): number {
    return iz * side * side + iy * side + ix;
  }

  // Collect all surviving edges
  type EdgePair = [number, number];
  const survivingEdges: EdgePair[] = [];

  // X-axis edges: edge (ix,iy,iz)->(ix+1,iy,iz) borders cells with cy in {iy-1,iy}, cz in {iz-1,iz}
  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < N; ix++) {
        // Check if any adjacent cell is alive
        const alive =
          isCellAlive(ix, iy - 1, iz - 1) ||
          isCellAlive(ix, iy, iz - 1) ||
          isCellAlive(ix, iy - 1, iz) ||
          isCellAlive(ix, iy, iz);
        if (alive) {
          survivingEdges.push([vertexIndex(ix, iy, iz), vertexIndex(ix + 1, iy, iz)]);
        }
      }
    }
  }

  // Y-axis edges: edge (ix,iy,iz)->(ix,iy+1,iz) borders cells with cx in {ix-1,ix}, cz in {iz-1,iz}
  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < side; ix++) {
        const alive =
          isCellAlive(ix - 1, iy, iz - 1) ||
          isCellAlive(ix, iy, iz - 1) ||
          isCellAlive(ix - 1, iy, iz) ||
          isCellAlive(ix, iy, iz);
        if (alive) {
          survivingEdges.push([vertexIndex(ix, iy, iz), vertexIndex(ix, iy + 1, iz)]);
        }
      }
    }
  }

  // Z-axis edges: edge (ix,iy,iz)->(ix,iy,iz+1) borders cells with cx in {ix-1,ix}, cy in {iy-1,iy}
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < side; ix++) {
        const alive =
          isCellAlive(ix - 1, iy - 1, iz) ||
          isCellAlive(ix, iy - 1, iz) ||
          isCellAlive(ix - 1, iy, iz) ||
          isCellAlive(ix, iy, iz);
        if (alive) {
          survivingEdges.push([vertexIndex(ix, iy, iz), vertexIndex(ix, iy, iz + 1)]);
        }
      }
    }
  }

  // --- Vertex compaction ---
  // Collect referenced vertex indices
  const referencedVertices = new Set<number>();
  for (const [v0, v1] of survivingEdges) {
    referencedVertices.add(v0);
    referencedVertices.add(v1);
  }

  // Build old->new index mapping
  const oldToNew = new Map<number, number>();
  const sortedOld = Array.from(referencedVertices).sort((a, b) => a - b);
  for (let i = 0; i < sortedOld.length; i++) {
    oldToNew.set(sortedOld[i], i);
  }

  const compactVertexCount = sortedOld.length;
  const compactEdgeCount = survivingEdges.length;

  // Count connectivity (edges per vertex)
  const connectivityCount = new Float32Array(compactVertexCount);
  for (const [v0, v1] of survivingEdges) {
    connectivityCount[oldToNew.get(v0)!]++;
    connectivityCount[oldToNew.get(v1)!]++;
  }

  // Build compacted vertex arrays
  const compactPositions = new Float32Array(compactVertexCount * 3);
  const compactRandom = new Float32Array(compactVertexCount * 3);
  for (let i = 0; i < sortedOld.length; i++) {
    const oldIdx = sortedOld[i];
    compactPositions[i * 3] = vertexPositions[oldIdx * 3];
    compactPositions[i * 3 + 1] = vertexPositions[oldIdx * 3 + 1];
    compactPositions[i * 3 + 2] = vertexPositions[oldIdx * 3 + 2];
    compactRandom[i * 3] = vertexRandom[oldIdx * 3];
    compactRandom[i * 3 + 1] = vertexRandom[oldIdx * 3 + 1];
    compactRandom[i * 3 + 2] = vertexRandom[oldIdx * 3 + 2];
  }

  // Build compacted edge arrays
  const edgePositions = new Float32Array(compactEdgeCount * 2 * 3);
  const edgeRandoms = new Float32Array(compactEdgeCount * 2 * 3);

  for (let ei = 0; ei < survivingEdges.length; ei++) {
    const [v0, v1] = survivingEdges[ei];
    const base = ei * 6;
    const x0 = vertexPositions[v0 * 3];
    const y0 = vertexPositions[v0 * 3 + 1];
    const z0 = vertexPositions[v0 * 3 + 2];
    const x1 = vertexPositions[v1 * 3];
    const y1 = vertexPositions[v1 * 3 + 1];
    const z1 = vertexPositions[v1 * 3 + 2];

    edgePositions[base] = x0;
    edgePositions[base + 1] = y0;
    edgePositions[base + 2] = z0;
    edgePositions[base + 3] = x1;
    edgePositions[base + 4] = y1;
    edgePositions[base + 5] = z1;

    const [r0a, r0b, r0c] = hashRandomFromPosition(x0, y0, z0);
    edgeRandoms[base] = r0a;
    edgeRandoms[base + 1] = r0b;
    edgeRandoms[base + 2] = r0c;
    const [r1a, r1b, r1c] = hashRandomFromPosition(x1, y1, z1);
    edgeRandoms[base + 3] = r1a;
    edgeRandoms[base + 4] = r1b;
    edgeRandoms[base + 5] = r1c;
  }

  // Build cell offsets for alive cells (centered at origin)
  let aliveCount = 0;
  for (let i = 0; i < cellCount; i++) {
    if (cellAlive[i] === 1) aliveCount++;
  }

  const cellOffsets = new Float32Array(aliveCount * 3);
  let ci = 0;
  for (let cz = 0; cz < N; cz++) {
    for (let cy = 0; cy < N; cy++) {
      for (let cx = 0; cx < N; cx++) {
        if (cellAlive[cellIndex(cx, cy, cz)] === 1) {
          // Cell center = (cx + 0.5) * cellSize - offset
          cellOffsets[ci * 3] = (cx + 0.5) * cellSize - offset;
          cellOffsets[ci * 3 + 1] = (cy + 0.5) * cellSize - offset;
          cellOffsets[ci * 3 + 2] = (cz + 0.5) * cellSize - offset;
          ci++;
        }
      }
    }
  }

  return {
    vertices: {
      positions: compactPositions,
      aRandom: compactRandom,
      connectivity: connectivityCount,
      vertexCount: compactVertexCount,
    },
    edges: {
      positions: edgePositions,
      randoms: edgeRandoms,
      edgeCount: compactEdgeCount,
    },
    cellOffsets,
    cellScale: cellSize,
  };
}

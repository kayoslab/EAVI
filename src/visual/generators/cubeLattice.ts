/**
 * Cube lattice generator.
 * Produces an NxNxN grid of cube wireframes with shared/merged vertices
 * at adjacent cube boundaries. Adjacent cubes share edges and vertices
 * to avoid duplication.
 */

import { hashRandomFromPosition } from './subdivideEdges';

export interface CubeLatticeVertexData {
  positions: Float32Array;
  aRandom: Float32Array;
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
}): CubeLatticeResult {
  const { gridSize: N, cellSize } = opts;

  // --- Vertices ---
  const side = N + 1;
  const vertexCount = side * side * side;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandom = new Float32Array(vertexCount * 3);

  // Center offset so the lattice is centered at origin
  const offset = (N * cellSize) / 2;

  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < side; ix++) {
        const idx = (iz * side * side + iy * side + ix) * 3;
        const x = ix * cellSize - offset;
        const y = iy * cellSize - offset;
        const z = iz * cellSize - offset;

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

  // --- Edges ---
  // Total unique edges = 3 * N * (N+1)^2
  // Edges along X: N edges per row, (N+1)^2 rows in YZ plane
  // Edges along Y: N edges per column, (N+1)^2 columns in XZ plane
  // Edges along Z: N edges per depth, (N+1)^2 stacks in XY plane
  const edgeCount = 3 * N * side * side;
  const edgePositions = new Float32Array(edgeCount * 2 * 3);
  const edgeRandoms = new Float32Array(edgeCount * 2 * 3);

  let ei = 0;

  function vertexIndex(ix: number, iy: number, iz: number): number {
    return iz * side * side + iy * side + ix;
  }

  function writeEdge(v0: number, v1: number): void {
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

    ei++;
  }

  // X-axis edges
  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < N; ix++) {
        writeEdge(vertexIndex(ix, iy, iz), vertexIndex(ix + 1, iy, iz));
      }
    }
  }

  // Y-axis edges
  for (let iz = 0; iz < side; iz++) {
    for (let iy = 0; iy < N; iy++) {
      for (let ix = 0; ix < side; ix++) {
        writeEdge(vertexIndex(ix, iy, iz), vertexIndex(ix, iy + 1, iz));
      }
    }
  }

  // Z-axis edges
  for (let iz = 0; iz < N; iz++) {
    for (let iy = 0; iy < side; iy++) {
      for (let ix = 0; ix < side; ix++) {
        writeEdge(vertexIndex(ix, iy, iz), vertexIndex(ix, iy, iz + 1));
      }
    }
  }

  return {
    vertices: {
      positions: vertexPositions,
      aRandom: vertexRandom,
      vertexCount,
    },
    edges: {
      positions: edgePositions,
      randoms: edgeRandoms,
      edgeCount,
    },
  };
}

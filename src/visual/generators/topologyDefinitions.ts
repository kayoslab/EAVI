/**
 * Geometric topology definitions for constellation line system.
 * Defines unit-geometry vertex tables and edge index tables for
 * tetrahedron, octahedron, and icosahedron topologies.
 */

export interface TopologyDef {
  name: string;
  vertices: number[][];
  edges: [number, number][];
}

const TETRAHEDRON: TopologyDef = {
  name: 'tetrahedron',
  vertices: [
    [1, 1, 1],
    [1, -1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
  ],
  edges: [
    [0, 1], [0, 2], [0, 3],
    [1, 2], [1, 3], [2, 3],
  ],
};

const OCTAHEDRON: TopologyDef = {
  name: 'octahedron',
  vertices: [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ],
  edges: [
    [0, 2], [0, 3], [0, 4], [0, 5],
    [1, 2], [1, 3], [1, 4], [1, 5],
    [2, 4], [2, 5], [3, 4], [3, 5],
  ],
};

const PHI = (1 + Math.sqrt(5)) / 2;

const ICOSAHEDRON: TopologyDef = {
  name: 'icosahedron',
  vertices: [
    [-1, PHI, 0],
    [1, PHI, 0],
    [-1, -PHI, 0],
    [1, -PHI, 0],
    [0, -1, PHI],
    [0, 1, PHI],
    [0, -1, -PHI],
    [0, 1, -PHI],
    [PHI, 0, -1],
    [PHI, 0, 1],
    [-PHI, 0, -1],
    [-PHI, 0, 1],
  ],
  edges: [
    [0, 1], [0, 5], [0, 7], [0, 10], [0, 11],
    [1, 5], [1, 7], [1, 8], [1, 9],
    [2, 3], [2, 4], [2, 6], [2, 10], [2, 11],
    [3, 4], [3, 6], [3, 8], [3, 9],
    [4, 5], [4, 9], [4, 11],
    [5, 9], [5, 11],
    [6, 7], [6, 8], [6, 10],
    [7, 8], [7, 10],
    [8, 9],
    [10, 11],
  ],
};

export const TOPOLOGIES: TopologyDef[] = [TETRAHEDRON, OCTAHEDRON, ICOSAHEDRON];

export function pickTopologies(rng: () => number, count: number): TopologyDef[] {
  const result: TopologyDef[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rng() * TOPOLOGIES.length);
    result.push(TOPOLOGIES[idx]);
  }
  return result;
}

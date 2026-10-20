/**
 * Recursive wireframe fractals as edge lists with a recursion level per edge:
 * the Sierpinski tetrahedron and the Menger sponge. Level 0 is the outline,
 * deeper levels are the smaller copies, so a layer can reveal depth over time.
 */
export interface LevelledEdges {
  /** Two xyz vertices per edge, interleaved. */
  positions: Float32Array;
  /** Recursion level per edge. */
  levels: Float32Array;
  edgeCount: number;
  maxLevel: number;
}

type V3 = [number, number, number];

function pushEdges(out: number[], levels: number[], verts: V3[], pairs: [number, number][], level: number): void {
  for (const [a, b] of pairs) {
    out.push(...verts[a], ...verts[b]);
    levels.push(level);
  }
}

const TETRA: V3[] = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
const TETRA_EDGES: [number, number][] = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

export function sierpinskiWire(depth: number, radius = 1): LevelledEdges {
  const out: number[] = [];
  const levels: number[] = [];
  const recurse = (center: V3, size: number, level: number) => {
    const verts = TETRA.map((v) => [center[0] + v[0] * size, center[1] + v[1] * size, center[2] + v[2] * size] as V3);
    pushEdges(out, levels, verts, TETRA_EDGES, level);
    if (level >= depth) return;
    for (const v of TETRA) recurse([center[0] + v[0] * size * 0.5, center[1] + v[1] * size * 0.5, center[2] + v[2] * size * 0.5], size * 0.5, level + 1);
  };
  recurse([0, 0, 0], radius / Math.sqrt(3), 0);
  return { positions: Float32Array.from(out), levels: Float32Array.from(levels), edgeCount: levels.length, maxLevel: depth };
}

const CUBE: V3[] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const CUBE_EDGES: [number, number][] = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

export function mengerWire(depth: number, radius = 1): LevelledEdges {
  const out: number[] = [];
  const levels: number[] = [];
  const recurse = (center: V3, half: number, level: number) => {
    const verts = CUBE.map((v) => [center[0] + v[0] * half, center[1] + v[1] * half, center[2] + v[2] * half] as V3);
    pushEdges(out, levels, verts, CUBE_EDGES, level);
    if (level >= depth) return;
    const third = half / 3;
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      // Menger rule: drop the centre of each face and the core.
      if ((x === 0 ? 1 : 0) + (y === 0 ? 1 : 0) + (z === 0 ? 1 : 0) >= 2) continue;
      recurse([center[0] + x * 2 * third, center[1] + y * 2 * third, center[2] + z * 2 * third], third, level + 1);
    }
  };
  recurse([0, 0, 0], radius, 0);
  return { positions: Float32Array.from(out), levels: Float32Array.from(levels), edgeCount: levels.length, maxLevel: depth };
}

/** 3D Hilbert curve: order n gives 8^n points on a unit cube centred at the origin, consecutive points one step apart. */
export function hilbert3d(order: number): Float32Array {
  const n = Math.max(1, Math.min(6, Math.floor(order)));
  const out: number[] = [];
  const recurse = (center: V3, size: number, iterations: number, v: number[]) => {
    const half = size / 2;
    const corners: V3[] = [
      [center[0] - half, center[1] + half, center[2] - half],
      [center[0] - half, center[1] + half, center[2] + half],
      [center[0] - half, center[1] - half, center[2] + half],
      [center[0] - half, center[1] - half, center[2] - half],
      [center[0] + half, center[1] - half, center[2] - half],
      [center[0] + half, center[1] - half, center[2] + half],
      [center[0] + half, center[1] + half, center[2] + half],
      [center[0] + half, center[1] + half, center[2] - half],
    ];
    const vec = v.map((i) => corners[i]);
    if (iterations > 0) {
      const [v0, v1, v2, v3, v4, v5, v6, v7] = v;
      recurse(vec[0], half, iterations - 1, [v0, v3, v4, v7, v6, v5, v2, v1]);
      recurse(vec[1], half, iterations - 1, [v0, v7, v6, v1, v2, v5, v4, v3]);
      recurse(vec[2], half, iterations - 1, [v0, v7, v6, v1, v2, v5, v4, v3]);
      recurse(vec[3], half, iterations - 1, [v2, v3, v0, v1, v6, v7, v4, v5]);
      recurse(vec[4], half, iterations - 1, [v2, v3, v0, v1, v6, v7, v4, v5]);
      recurse(vec[5], half, iterations - 1, [v4, v3, v2, v5, v6, v1, v0, v7]);
      recurse(vec[6], half, iterations - 1, [v4, v3, v2, v5, v6, v1, v0, v7]);
      recurse(vec[7], half, iterations - 1, [v6, v5, v2, v1, v0, v3, v4, v7]);
      return;
    }
    for (const c of vec) out.push(c[0], c[1], c[2]);
  };
  // Extremes sit at size · (1 − 2⁻ⁿ); choosing size so they land on ±0.5 gives a lattice step of 1 / (2ⁿ − 1).
  recurse([0, 0, 0], 0.5 / (1 - 1 / (1 << n)), n - 1, [0, 1, 2, 3, 4, 5, 6, 7]);
  return Float32Array.from(out);
}

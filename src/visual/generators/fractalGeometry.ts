import { createPRNG } from '../prng';

export type FractalStrategy = 'faceSubdivision' | 'branchingGrowth' | 'lSystemTree';

export const FRACTAL_STRATEGIES: readonly FractalStrategy[] = [
  'faceSubdivision',
  'branchingGrowth',
  'lSystemTree',
] as const;

export interface FractalConfig {
  strategy: FractalStrategy;
  depth: number;
  pointBudget: number;
  seed: string;
}

export interface FractalOutput {
  positions: Float32Array;
  edges: Float32Array | null;
  randoms: Float32Array;
  edgeCount: number;
  pointCount: number;
}

const MAX_POINTS = 50000;
const MAX_EDGES = 30000;
const MIN_DEPTH = 3;
const MAX_DEPTH = 6;
const TARGET_RADIUS = 2.5;

function clampDepth(depth: number): number {
  return Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.floor(depth)));
}

export function selectStrategy(seed: string): FractalStrategy {
  const rng = createPRNG(seed + ':fractal:select');
  const idx = Math.floor(rng() * FRACTAL_STRATEGIES.length) % FRACTAL_STRATEGIES.length;
  return FRACTAL_STRATEGIES[idx];
}

export function computeFractalDepth(seed: string, maxDepth: number): number {
  const clamped = Math.max(MIN_DEPTH, Math.min(MAX_DEPTH, Math.floor(maxDepth)));
  if (clamped <= MIN_DEPTH) return MIN_DEPTH;
  const rng = createPRNG(seed + ':fractal:depth');
  const range = clamped - MIN_DEPTH + 1;
  return MIN_DEPTH + Math.floor(rng() * range);
}

export function generateFractalGeometry(config: FractalConfig): FractalOutput {
  const budget = Math.min(Math.max(0, Math.floor(config.pointBudget)), MAX_POINTS);
  if (budget <= 0) {
    return {
      positions: new Float32Array(0),
      edges: new Float32Array(0),
      randoms: new Float32Array(0),
      edgeCount: 0,
      pointCount: 0,
    };
  }

  const depth = clampDepth(config.depth);
  const rng = createPRNG(config.seed + ':fractal:' + config.strategy);

  let result: FractalOutput;
  if (config.strategy === 'faceSubdivision') {
    result = fillFaceSubdivision(rng, depth, budget);
  } else {
    result = fillBranchingGrowth(rng, depth, budget);
  }

  normalizeToRadius(result.positions, result.pointCount, TARGET_RADIUS);
  if (result.edges) {
    normalizeToRadius(result.edges, result.edgeCount * 2, TARGET_RADIUS);
  }
  validateFinite(result.positions, result.pointCount * 3);
  if (result.edges) {
    validateFinite(result.edges, result.edgeCount * 6);
  }

  return result;
}

// --- Face Subdivision ---

interface Triangle {
  ax: number; ay: number; az: number;
  bx: number; by: number; bz: number;
  cx: number; cy: number; cz: number;
}

function fillFaceSubdivision(
  rng: () => number,
  depth: number,
  pointBudget: number,
): FractalOutput {
  const edgeBudget = Math.min(MAX_EDGES, pointBudget * 3);

  // Initial tetrahedron vertices
  const s = 1.0;
  const v0: [number, number, number] = [s, s, s];
  const v1: [number, number, number] = [s, -s, -s];
  const v2: [number, number, number] = [-s, s, -s];
  const v3: [number, number, number] = [-s, -s, s];

  // 4 triangular faces
  let faces: Triangle[] = [
    { ax: v0[0], ay: v0[1], az: v0[2], bx: v1[0], by: v1[1], bz: v1[2], cx: v2[0], cy: v2[1], cz: v2[2] },
    { ax: v0[0], ay: v0[1], az: v0[2], bx: v2[0], by: v2[1], bz: v2[2], cx: v3[0], cy: v3[1], cz: v3[2] },
    { ax: v0[0], ay: v0[1], az: v0[2], bx: v3[0], by: v3[1], bz: v3[2], cx: v1[0], cy: v1[1], cz: v1[2] },
    { ax: v1[0], ay: v1[1], az: v1[2], bx: v3[0], by: v3[1], bz: v3[2], cx: v2[0], cy: v2[1], cz: v2[2] },
  ];

  const roughness = 0.5 + rng() * 0.2; // 0.5-0.7

  // Iterative subdivision
  for (let d = 0; d < depth; d++) {
    const nextFaces: Triangle[] = [];
    const scale = Math.pow(roughness, d + 1);

    for (const tri of faces) {
      // Midpoints with displacement
      const mab = midpoint(tri.ax, tri.ay, tri.az, tri.bx, tri.by, tri.bz, scale, rng);
      const mbc = midpoint(tri.bx, tri.by, tri.bz, tri.cx, tri.cy, tri.cz, scale, rng);
      const mca = midpoint(tri.cx, tri.cy, tri.cz, tri.ax, tri.ay, tri.az, scale, rng);

      // 4 sub-triangles
      nextFaces.push(
        { ax: tri.ax, ay: tri.ay, az: tri.az, bx: mab[0], by: mab[1], bz: mab[2], cx: mca[0], cy: mca[1], cz: mca[2] },
        { ax: mab[0], ay: mab[1], az: mab[2], bx: tri.bx, by: tri.by, bz: tri.bz, cx: mbc[0], cy: mbc[1], cz: mbc[2] },
        { ax: mca[0], ay: mca[1], az: mca[2], bx: mbc[0], by: mbc[1], bz: mbc[2], cx: tri.cx, cy: tri.cy, cz: tri.cz },
        { ax: mab[0], ay: mab[1], az: mab[2], bx: mbc[0], by: mbc[1], bz: mbc[2], cx: mca[0], cy: mca[1], cz: mca[2] },
      );

      // Early exit if we'd exceed budget
      if (nextFaces.length * 3 > pointBudget) break;
    }

    faces = nextFaces;
    if (faces.length * 3 > pointBudget) break;
  }

  // Collect vertices (3 per face, duplicated for simplicity)
  const vertCount = Math.min(faces.length * 3, pointBudget);
  const faceCount = Math.floor(vertCount / 3);
  const actualVertCount = faceCount * 3;

  const positions = new Float32Array(actualVertCount * 3);
  const randoms = new Float32Array(actualVertCount * 3);

  for (let i = 0; i < faceCount; i++) {
    const f = faces[i];
    const base = i * 9;
    positions[base] = f.ax; positions[base + 1] = f.ay; positions[base + 2] = f.az;
    positions[base + 3] = f.bx; positions[base + 4] = f.by; positions[base + 5] = f.bz;
    positions[base + 6] = f.cx; positions[base + 7] = f.cy; positions[base + 8] = f.cz;
  }

  for (let i = 0; i < actualVertCount * 3; i++) {
    randoms[i] = rng();
  }

  // Collect edges: 3 edges per face (ab, bc, ca)
  const maxEdges = Math.min(faceCount * 3, edgeBudget);
  const edges = new Float32Array(maxEdges * 6);
  let edgeIdx = 0;
  for (let i = 0; i < faceCount && edgeIdx < maxEdges; i++) {
    const f = faces[i];
    // Edge ab
    if (edgeIdx < maxEdges) {
      const e = edgeIdx * 6;
      edges[e] = f.ax; edges[e + 1] = f.ay; edges[e + 2] = f.az;
      edges[e + 3] = f.bx; edges[e + 4] = f.by; edges[e + 5] = f.bz;
      edgeIdx++;
    }
    // Edge bc
    if (edgeIdx < maxEdges) {
      const e = edgeIdx * 6;
      edges[e] = f.bx; edges[e + 1] = f.by; edges[e + 2] = f.bz;
      edges[e + 3] = f.cx; edges[e + 4] = f.cy; edges[e + 5] = f.cz;
      edgeIdx++;
    }
    // Edge ca
    if (edgeIdx < maxEdges) {
      const e = edgeIdx * 6;
      edges[e] = f.cx; edges[e + 1] = f.cy; edges[e + 2] = f.cz;
      edges[e + 3] = f.ax; edges[e + 4] = f.ay; edges[e + 5] = f.az;
      edgeIdx++;
    }
  }

  return {
    positions,
    edges: edges.subarray(0, edgeIdx * 6),
    randoms,
    edgeCount: edgeIdx,
    pointCount: actualVertCount,
  };
}

function midpoint(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  displacementScale: number,
  rng: () => number,
): [number, number, number] {
  const mx = (ax + bx) * 0.5;
  const my = (ay + by) * 0.5;
  const mz = (az + bz) * 0.5;

  // Compute face normal approximation for displacement direction
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;

  // Random displacement along a random direction (not just normal)
  const disp = (rng() - 0.5) * displacementScale * len;
  const nx = (rng() - 0.5);
  const ny = (rng() - 0.5);
  const nz = (rng() - 0.5);
  const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;

  return [
    mx + (nx / nLen) * disp,
    my + (ny / nLen) * disp,
    mz + (nz / nLen) * disp,
  ];
}

// --- Branching Growth ---

interface BranchNode {
  x: number; y: number; z: number;
  dx: number; dy: number; dz: number;
  length: number;
  depthRemaining: number;
}

function fillBranchingGrowth(
  rng: () => number,
  depth: number,
  pointBudget: number,
): FractalOutput {
  const edgeBudget = Math.min(MAX_EDGES, pointBudget * 2);
  const lengthDecay = 0.6 + rng() * 0.15; // 0.6-0.75
  const pointsPerSegment = Math.max(2, Math.floor(3 + rng() * 3)); // 2-5 points per branch segment

  // Initial direction
  const idx = rng() - 0.5;
  const idy = 0.5 + rng() * 0.5; // bias upward
  const idz = rng() - 0.5;
  const ilen = Math.sqrt(idx * idx + idy * idy + idz * idz) || 1;

  const stack: BranchNode[] = [{
    x: 0, y: 0, z: 0,
    dx: idx / ilen, dy: idy / ilen, dz: idz / ilen,
    length: 1.0,
    depthRemaining: depth,
  }];

  const positionsList: number[] = [];
  const edgesList: number[] = [];
  let pointCount = 0;
  let edgeCount = 0;

  while (stack.length > 0) {
    if (pointCount >= pointBudget) break;

    const node = stack.pop()!;
    if (node.depthRemaining <= 0) continue;

    // Generate points along this branch segment
    const endX = node.x + node.dx * node.length;
    const endY = node.y + node.dy * node.length;
    const endZ = node.z + node.dz * node.length;

    const segPoints = Math.min(pointsPerSegment, pointBudget - pointCount);
    for (let i = 0; i < segPoints; i++) {
      const t = segPoints > 1 ? i / (segPoints - 1) : 0;
      const jitter = node.length * 0.05;
      positionsList.push(
        node.x + (endX - node.x) * t + (rng() - 0.5) * jitter,
        node.y + (endY - node.y) * t + (rng() - 0.5) * jitter,
        node.z + (endZ - node.z) * t + (rng() - 0.5) * jitter,
      );
      pointCount++;
    }

    // Edge from start to end
    if (edgeCount < edgeBudget) {
      edgesList.push(node.x, node.y, node.z, endX, endY, endZ);
      edgeCount++;
    }

    // Spawn child branches
    if (node.depthRemaining > 1) {
      const childCount = 2 + Math.floor(rng() * 3); // 2-4 children
      const childLength = node.length * lengthDecay;

      for (let c = 0; c < childCount; c++) {
        if (pointCount >= pointBudget) break;

        const angle = (30 + rng() * 30) * Math.PI / 180; // 30-60 degrees
        const rotDir = rotateDirection(node.dx, node.dy, node.dz, angle, rng);

        stack.push({
          x: endX,
          y: endY,
          z: endZ,
          dx: rotDir[0],
          dy: rotDir[1],
          dz: rotDir[2],
          length: childLength,
          depthRemaining: node.depthRemaining - 1,
        });
      }
    }
  }

  const positions = new Float32Array(pointCount * 3);
  for (let i = 0; i < pointCount * 3; i++) {
    positions[i] = positionsList[i];
  }

  const edges = new Float32Array(edgeCount * 6);
  for (let i = 0; i < edgeCount * 6; i++) {
    edges[i] = edgesList[i];
  }

  const randoms = new Float32Array(pointCount * 3);
  for (let i = 0; i < pointCount * 3; i++) {
    randoms[i] = rng();
  }

  return { positions, edges, randoms, edgeCount, pointCount };
}

function rotateDirection(
  dx: number, dy: number, dz: number,
  angle: number,
  rng: () => number,
): [number, number, number] {
  // Generate a random axis perpendicular-ish to the direction
  let ax = rng() - 0.5;
  let ay = rng() - 0.5;
  let az = rng() - 0.5;

  // Gram-Schmidt: make axis perpendicular to direction
  const dot = ax * dx + ay * dy + az * dz;
  ax -= dot * dx;
  ay -= dot * dy;
  az -= dot * dz;
  const aLen = Math.sqrt(ax * ax + ay * ay + az * az);
  if (aLen < 1e-10) {
    // Fallback: use any perpendicular
    ax = -dz; ay = dx; az = dy;
    const fLen = Math.sqrt(ax * ax + ay * ay + az * az) || 1;
    ax /= fLen; ay /= fLen; az /= fLen;
  } else {
    ax /= aLen; ay /= aLen; az /= aLen;
  }

  // Rodrigues' rotation formula
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const cross_x = ay * dz - az * dy;
  const cross_y = az * dx - ax * dz;
  const cross_z = ax * dy - ay * dx;
  const adot = ax * dx + ay * dy + az * dz;

  const rx = dx * cos + cross_x * sin + ax * adot * (1 - cos);
  const ry = dy * cos + cross_y * sin + ay * adot * (1 - cos);
  const rz = dz * cos + cross_z * sin + az * adot * (1 - cos);

  const rLen = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  return [rx / rLen, ry / rLen, rz / rLen];
}

// --- Utilities ---

function normalizeToRadius(arr: Float32Array, vertexCount: number, radius: number): void {
  if (vertexCount === 0) return;

  let maxDist = 0;
  for (let i = 0; i < vertexCount; i++) {
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    const d = Math.sqrt(x * x + y * y + z * z);
    if (d > maxDist) maxDist = d;
  }

  if (maxDist < 1e-10) return;

  const scale = radius / maxDist;
  for (let i = 0; i < vertexCount * 3; i++) {
    arr[i] *= scale;
  }
}

function validateFinite(arr: Float32Array, length: number): void {
  for (let i = 0; i < length; i++) {
    if (!Number.isFinite(arr[i])) {
      arr[i] = 0;
    }
  }
}

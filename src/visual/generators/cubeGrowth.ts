import { createPRNG } from '../prng';

// Unit cube: 8 corner positions centered at origin
export const CUBE_VERTICES: readonly [number, number, number][] = [
  [-0.5, -0.5, -0.5],
  [ 0.5, -0.5, -0.5],
  [ 0.5,  0.5, -0.5],
  [-0.5,  0.5, -0.5],
  [-0.5, -0.5,  0.5],
  [ 0.5, -0.5,  0.5],
  [ 0.5,  0.5,  0.5],
  [-0.5,  0.5,  0.5],
];

// 12 edges of a cube as index pairs into CUBE_VERTICES
export const CUBE_EDGES: readonly [number, number][] = [
  // bottom face
  [0, 1], [1, 2], [2, 3], [3, 0],
  // top face
  [4, 5], [5, 6], [6, 7], [7, 4],
  // vertical edges
  [0, 4], [1, 5], [2, 6], [3, 7],
];

// 6 face centers with outward normals (for child cube placement)
const FACE_CENTERS: readonly { cx: number; cy: number; cz: number; nx: number; ny: number; nz: number }[] = [
  { cx:  0.0, cy:  0.0, cz: -0.5, nx:  0, ny:  0, nz: -1 },
  { cx:  0.0, cy:  0.0, cz:  0.5, nx:  0, ny:  0, nz:  1 },
  { cx: -0.5, cy:  0.0, cz:  0.0, nx: -1, ny:  0, nz:  0 },
  { cx:  0.5, cy:  0.0, cz:  0.0, nx:  1, ny:  0, nz:  0 },
  { cx:  0.0, cy: -0.5, cz:  0.0, nx:  0, ny: -1, nz:  0 },
  { cx:  0.0, cy:  0.5, cz:  0.0, nx:  0, ny:  1, nz:  0 },
];

export interface CubeGrowthConfig {
  seed: string;
  depth: number;
  maxVertices: number;
  maxEdges: number;
}

export interface CubeGrowthOutput {
  vertexPositions: Float32Array;
  edgePositions: Float32Array;
  vertexRandoms: Float32Array;
  edgeRandoms: Float32Array;
  vertexCount: number;
  edgeCount: number;
}

const TARGET_RADIUS = 2.5;

interface CubeInstance {
  // transform: position offset + scale
  ox: number; oy: number; oz: number;
  scale: number;
}

export function generateCubeGrowth(config: CubeGrowthConfig): CubeGrowthOutput {
  const maxDepth = Math.max(1, Math.min(5, Math.floor(config.depth)));
  const maxVertices = Math.max(0, Math.floor(config.maxVertices));
  const maxEdges = Math.max(0, Math.floor(config.maxEdges));

  const rng = createPRNG(config.seed + ':cubegrowth');

  // Collect all cube instances via iterative recursion
  const instances: CubeInstance[] = [];

  interface StackEntry {
    ox: number; oy: number; oz: number;
    scale: number;
    depth: number;
    faceKey: string;
  }

  const stack: StackEntry[] = [{
    ox: 0, oy: 0, oz: 0,
    scale: 1.0,
    depth: 0,
    faceKey: 'root',
  }];

  // Use a separate PRNG for branching decisions to keep deterministic order
  // We process breadth-first by using a queue approach
  const queue: StackEntry[] = [];
  queue.push(stack[0]);

  let qIdx = 0;
  while (qIdx < queue.length) {
    // Check budgets before adding this cube
    const currentVertexCount = instances.length * 8;
    const currentEdgeCount = instances.length * 12;
    if (currentVertexCount + 8 > maxVertices || currentEdgeCount + 12 > maxEdges) break;

    const entry = queue[qIdx++];

    // Add this cube instance
    instances.push({
      ox: entry.ox, oy: entry.oy, oz: entry.oz,
      scale: entry.scale,
    });

    // Spawn children if not at max depth
    if (entry.depth < maxDepth - 1) {
      const scaleFactor = 0.5 + rng() * 0.2; // 0.5-0.7 scale reduction
      const childScale = entry.scale * scaleFactor;

      // Branching probability decreases with depth
      const baseProbability = 0.6 - entry.depth * 0.1;

      for (let f = 0; f < 6; f++) {
        // Use deterministic per-face seed
        const faceRng = createPRNG(config.seed + ':face:' + entry.faceKey + ':' + f + ':d:' + entry.depth);
        const roll = faceRng();

        if (roll < baseProbability) {
          const face = FACE_CENTERS[f];
          // Child position: parent center + face center * parent scale + normal * child half-scale
          const childOx = entry.ox + (face.cx * entry.scale) + (face.nx * childScale * 0.5);
          const childOy = entry.oy + (face.cy * entry.scale) + (face.ny * childScale * 0.5);
          const childOz = entry.oz + (face.cz * entry.scale) + (face.nz * childScale * 0.5);

          // Check budget before queuing
          const projectedVertices = (instances.length + 1) * 8;
          const projectedEdges = (instances.length + 1) * 12;
          if (projectedVertices + 8 <= maxVertices && projectedEdges + 12 <= maxEdges) {
            queue.push({
              ox: childOx, oy: childOy, oz: childOz,
              scale: childScale,
              depth: entry.depth + 1,
              faceKey: entry.faceKey + ':' + f,
            });
          }
        }
      }
    }
  }

  const cubeCount = instances.length;
  const vertexCount = cubeCount * 8;
  const edgeCount = cubeCount * 12;

  // Build merged vertex buffer
  const vertexPositions = new Float32Array(vertexCount * 3);
  for (let c = 0; c < cubeCount; c++) {
    const inst = instances[c];
    const baseIdx = c * 8 * 3;
    for (let v = 0; v < 8; v++) {
      const cv = CUBE_VERTICES[v];
      vertexPositions[baseIdx + v * 3]     = inst.ox + cv[0] * inst.scale;
      vertexPositions[baseIdx + v * 3 + 1] = inst.oy + cv[1] * inst.scale;
      vertexPositions[baseIdx + v * 3 + 2] = inst.oz + cv[2] * inst.scale;
    }
  }

  // Build merged edge buffer (LineSegments pairs)
  const edgePositions = new Float32Array(edgeCount * 2 * 3);
  for (let c = 0; c < cubeCount; c++) {
    const inst = instances[c];
    const baseIdx = c * 12 * 6; // 12 edges * 2 verts * 3 components
    for (let e = 0; e < 12; e++) {
      const [a, b] = CUBE_EDGES[e];
      const va = CUBE_VERTICES[a];
      const vb = CUBE_VERTICES[b];
      const eIdx = baseIdx + e * 6;
      edgePositions[eIdx]     = inst.ox + va[0] * inst.scale;
      edgePositions[eIdx + 1] = inst.oy + va[1] * inst.scale;
      edgePositions[eIdx + 2] = inst.oz + va[2] * inst.scale;
      edgePositions[eIdx + 3] = inst.ox + vb[0] * inst.scale;
      edgePositions[eIdx + 4] = inst.oy + vb[1] * inst.scale;
      edgePositions[eIdx + 5] = inst.oz + vb[2] * inst.scale;
    }
  }

  // Normalize to TARGET_RADIUS
  normalizeToRadius(vertexPositions, vertexCount, TARGET_RADIUS);
  normalizeToRadius(edgePositions, edgeCount * 2, TARGET_RADIUS);

  // Validate finite
  validateFinite(vertexPositions);
  validateFinite(edgePositions);

  // Generate per-vertex randoms using deterministic hash
  const vertexRandoms = new Float32Array(vertexCount * 3);
  const randomRng = createPRNG(config.seed + ':cubegrowth:randoms');
  for (let i = 0; i < vertexCount * 3; i++) {
    vertexRandoms[i] = randomRng();
  }

  // Generate per-edge-vertex randoms
  const edgeRandoms = new Float32Array(edgeCount * 2 * 3);
  const edgeRandomRng = createPRNG(config.seed + ':cubegrowth:edgerandoms');
  for (let i = 0; i < edgeCount * 2 * 3; i++) {
    edgeRandoms[i] = edgeRandomRng();
  }

  return {
    vertexPositions,
    edgePositions,
    vertexRandoms,
    edgeRandoms,
    vertexCount,
    edgeCount,
  };
}

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

function validateFinite(arr: Float32Array): void {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      arr[i] = 0;
    }
  }
}

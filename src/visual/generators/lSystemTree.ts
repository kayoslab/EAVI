import { createPRNG } from '../prng';

export interface LSystemTreeConfig {
  seed: string;
  depth: number;
  maxVertices: number;
  maxEdges: number;
}

export interface LSystemTreeOutput {
  vertexPositions: Float32Array;
  edgePositions: Float32Array;
  vertexRandoms: Float32Array;
  edgeRandoms: Float32Array;
  vertexCount: number;
  edgeCount: number;
  instanceOffsets: Float32Array;
  instanceScales: Float32Array;
  normScale: number;
}

const TARGET_RADIUS = 2.5;

// Turtle state for 3D L-system interpretation
interface TurtleState {
  x: number; y: number; z: number;
  // Forward direction
  fx: number; fy: number; fz: number;
  // Up direction
  ux: number; uy: number; uz: number;
  // Left direction (cross product of up and forward)
  lx: number; ly: number; lz: number;
  length: number;
  depth: number;
}

/**
 * Generate a recursive 3D L-system tree structure.
 *
 * Axiom: F
 * Rule: F → F[+F][-F][^F][&F]
 *
 * Commands:
 *   F = move forward, drawing a branch segment
 *   + = yaw right
 *   - = yaw left
 *   ^ = pitch up
 *   & = pitch down
 *   [ = push turtle state
 *   ] = pop turtle state
 */
export function generateLSystemTree(config: LSystemTreeConfig): LSystemTreeOutput {
  const maxDepth = Math.max(1, Math.min(6, Math.floor(config.depth)));
  const maxVertices = Math.max(0, Math.floor(config.maxVertices));
  const maxEdges = Math.max(0, Math.floor(config.maxEdges));

  const rng = createPRNG(config.seed + ':lsystem');

  // Generate the L-system string
  const lString = expandLSystem(maxDepth, rng);

  // Interpret the L-system string with a 3D turtle
  const baseAngle = 25 + rng() * 10; // 25-35 degrees base angle
  const angleDeg = baseAngle * Math.PI / 180;
  const lengthDecay = 0.65 + rng() * 0.15; // 0.65-0.80
  const initialLength = 1.0;

  // Collect branch segments (edges) and junction vertices
  const edgesList: number[] = [];
  const verticesList: number[] = [];
  const vertexDepths: number[] = [];
  const edgeDepths: number[] = [];

  let edgeCount = 0;
  let vertexCount = 0;

  const stack: TurtleState[] = [];
  let turtle: TurtleState = {
    x: 0, y: 0, z: 0,
    fx: 0, fy: 1, fz: 0,  // forward = up
    ux: 0, uy: 0, uz: -1, // up = -Z
    lx: -1, ly: 0, lz: 0, // left = -X
    length: initialLength,
    depth: 0,
  };

  // Add root vertex
  verticesList.push(turtle.x, turtle.y, turtle.z);
  vertexDepths.push(0);
  vertexCount++;

  const jitterRng = createPRNG(config.seed + ':lsystem:jitter');

  for (let i = 0; i < lString.length; i++) {
    if (vertexCount >= maxVertices && edgeCount >= maxEdges) break;

    const ch = lString[i];

    switch (ch) {
      case 'F': {
        if (edgeCount >= maxEdges) break;

        // Angle jitter: ±15°
        const jitter = (jitterRng() - 0.5) * 30 * Math.PI / 180;
        const jAxis = jitterRng(); // random axis selection

        // Apply small random rotation for organic feel
        let { fx, fy, fz } = turtle;
        if (jAxis < 0.33) {
          // Yaw jitter
          const c = Math.cos(jitter * 0.3);
          const s = Math.sin(jitter * 0.3);
          const nfx = fx * c + turtle.lx * s;
          const nfz = fz * c + turtle.lz * s;
          fx = nfx; fz = nfz;
        } else if (jAxis < 0.67) {
          // Pitch jitter
          const c = Math.cos(jitter * 0.3);
          const s = Math.sin(jitter * 0.3);
          const nfx = fx * c + turtle.ux * s;
          const nfy = fy * c + turtle.uy * s;
          fx = nfx; fy = nfy;
        }
        // Renormalize forward
        const fLen = Math.sqrt(fx * fx + fy * fy + fz * fz) || 1;
        fx /= fLen; fy /= fLen; fz /= fLen;

        const endX = turtle.x + fx * turtle.length;
        const endY = turtle.y + fy * turtle.length;
        const endZ = turtle.z + fz * turtle.length;

        // Add edge (line segment pair)
        edgesList.push(
          turtle.x, turtle.y, turtle.z,
          endX, endY, endZ,
        );
        const depthRatio = turtle.depth / Math.max(1, maxDepth);
        edgeDepths.push(depthRatio, depthRatio);
        edgeCount++;

        // Add junction vertex at end
        if (vertexCount < maxVertices) {
          verticesList.push(endX, endY, endZ);
          vertexDepths.push(depthRatio);
          vertexCount++;
        }

        // Move turtle forward
        turtle.x = endX;
        turtle.y = endY;
        turtle.z = endZ;
        break;
      }

      case '+': { // yaw right
        const angle = angleDeg + (jitterRng() - 0.5) * angleDeg * 0.3;
        yawTurtle(turtle, angle);
        break;
      }

      case '-': { // yaw left
        const angle = -(angleDeg + (jitterRng() - 0.5) * angleDeg * 0.3);
        yawTurtle(turtle, angle);
        break;
      }

      case '^': { // pitch up
        const angle = angleDeg + (jitterRng() - 0.5) * angleDeg * 0.3;
        pitchTurtle(turtle, angle);
        break;
      }

      case '&': { // pitch down
        const angle = -(angleDeg + (jitterRng() - 0.5) * angleDeg * 0.3);
        pitchTurtle(turtle, angle);
        break;
      }

      case '[': {
        stack.push({ ...turtle });
        turtle.length *= lengthDecay;
        turtle.depth++;
        break;
      }

      case ']': {
        if (stack.length > 0) {
          turtle = stack.pop()!;
        }
        break;
      }
    }
  }

  // Build Float32Arrays
  const vertexPositions = new Float32Array(vertexCount * 3);
  for (let i = 0; i < vertexCount * 3; i++) {
    vertexPositions[i] = verticesList[i];
  }

  const edgePositions = new Float32Array(edgeCount * 6);
  for (let i = 0; i < edgeCount * 6; i++) {
    edgePositions[i] = edgesList[i];
  }

  // Compute normScale before normalizing
  const normScale = computeNormScale(vertexPositions, vertexCount, TARGET_RADIUS);

  // Normalize to TARGET_RADIUS
  normalizeToRadius(vertexPositions, vertexCount, TARGET_RADIUS);
  normalizeToRadius(edgePositions, edgeCount * 2, TARGET_RADIUS);

  // Build per-vertex randoms with depthRatio encoded in .y channel
  const vertexRandoms = new Float32Array(vertexCount * 3);
  const randomRng = createPRNG(config.seed + ':lsystem:randoms');
  for (let i = 0; i < vertexCount; i++) {
    vertexRandoms[i * 3] = randomRng();         // .x = random seed
    vertexRandoms[i * 3 + 1] = vertexDepths[i]; // .y = depthRatio (0=root, 1=tip)
    vertexRandoms[i * 3 + 2] = randomRng();     // .z = random seed
  }

  // Build per-edge-vertex randoms with depthRatio in .y
  const edgeRandoms = new Float32Array(edgeCount * 2 * 3);
  const edgeRandomRng = createPRNG(config.seed + ':lsystem:edgerandoms');
  for (let i = 0; i < edgeCount * 2; i++) {
    edgeRandoms[i * 3] = edgeRandomRng();       // .x = random seed
    edgeRandoms[i * 3 + 1] = edgeDepths[i];     // .y = depthRatio
    edgeRandoms[i * 3 + 2] = edgeRandomRng();   // .z = random seed
  }

  // Build instance transform arrays for occlusion compatibility
  // For L-system tree: each branch segment is an "instance"
  const instanceCount = Math.max(1, edgeCount);
  const instanceOffsets = new Float32Array(instanceCount * 3);
  const instanceScales = new Float32Array(instanceCount);
  for (let i = 0; i < edgeCount; i++) {
    // Instance center = midpoint of edge, normalized
    const sx = edgePositions[i * 6];
    const sy = edgePositions[i * 6 + 1];
    const sz = edgePositions[i * 6 + 2];
    const ex = edgePositions[i * 6 + 3];
    const ey = edgePositions[i * 6 + 4];
    const ez = edgePositions[i * 6 + 5];
    instanceOffsets[i * 3] = (sx + ex) * 0.5;
    instanceOffsets[i * 3 + 1] = (sy + ey) * 0.5;
    instanceOffsets[i * 3 + 2] = (sz + ez) * 0.5;
    // Instance scale = edge length
    const dx = ex - sx;
    const dy = ey - sy;
    const dz = ez - sz;
    instanceScales[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Validate finite
  validateFinite(vertexPositions);
  validateFinite(edgePositions);
  validateFinite(instanceOffsets);

  return {
    vertexPositions,
    edgePositions,
    vertexRandoms,
    edgeRandoms,
    vertexCount,
    edgeCount,
    instanceOffsets,
    instanceScales,
    normScale,
  };
}

/**
 * Expand the L-system string iteratively.
 * Axiom: F
 * Rule: F → F[+F][-F][^F][&F]
 * Pruning: seeded probability to skip branches at each depth.
 */
function expandLSystem(depth: number, rng: () => number): string {
  let current = 'F';

  for (let d = 0; d < depth - 1; d++) {
    let next = '';
    for (let i = 0; i < current.length; i++) {
      if (current[i] === 'F') {
        // Base expansion: F[+F][-F][^F][&F]
        // Pruning: skip some branches probabilistically
        const pruneThreshold = 0.3 + d * 0.1; // prune more at deeper levels
        next += 'F';
        // Always keep at least 2 branches for non-degenerate tree
        let branchesAdded = 0;
        const branches = [
          '[+F]', '[-F]', '[^F]', '[&F]',
        ];
        for (const branch of branches) {
          if (rng() > pruneThreshold || branchesAdded < 2) {
            next += branch;
            branchesAdded++;
          }
        }
      } else {
        next += current[i];
      }
    }
    current = next;
    // Safety: cap string length to prevent runaway expansion
    if (current.length > 50000) break;
  }

  return current;
}

function yawTurtle(t: TurtleState, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rotate forward and left around up axis
  const nfx = t.fx * c + t.lx * s;
  const nfy = t.fy * c + t.ly * s;
  const nfz = t.fz * c + t.lz * s;
  const nlx = -t.fx * s + t.lx * c;
  const nly = -t.fy * s + t.ly * c;
  const nlz = -t.fz * s + t.lz * c;
  t.fx = nfx; t.fy = nfy; t.fz = nfz;
  t.lx = nlx; t.ly = nly; t.lz = nlz;
}

function pitchTurtle(t: TurtleState, angle: number): void {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  // Rotate forward and up around left axis
  const nfx = t.fx * c + t.ux * s;
  const nfy = t.fy * c + t.uy * s;
  const nfz = t.fz * c + t.uz * s;
  const nux = -t.fx * s + t.ux * c;
  const nuy = -t.fy * s + t.uy * c;
  const nuz = -t.fz * s + t.uz * c;
  t.fx = nfx; t.fy = nfy; t.fz = nfz;
  t.ux = nux; t.uy = nuy; t.uz = nuz;
}

function computeNormScale(arr: Float32Array, vertexCount: number, radius: number): number {
  if (vertexCount === 0) return 1;
  let maxDist = 0;
  for (let i = 0; i < vertexCount; i++) {
    const x = arr[i * 3];
    const y = arr[i * 3 + 1];
    const z = arr[i * 3 + 2];
    const d = Math.sqrt(x * x + y * y + z * z);
    if (d > maxDist) maxDist = d;
  }
  if (maxDist < 1e-10) return 1;
  return radius / maxDist;
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

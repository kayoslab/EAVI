import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';

export interface TerrainHeightfieldResult {
  positions: Float32Array;    // edge positions (for LineSegments)
  randoms: Float32Array;      // edge randoms
  vertexPositions: Float32Array;  // grid vertex positions
  vertexRandoms: Float32Array;    // grid vertex randoms
  triangleIndices: Uint32Array;   // index buffer for triangle mesh (2 tris per cell)
  triangleCount: number;
  edgeCount: number;
  vertexCount: number;
  rows: number;
  cols: number;
}

export function generateTerrainHeightfield(opts: {
  rows: number;
  cols: number;
  seed: string;
  width?: number;
  depth?: number;
  heightScale?: number;
  octaves?: number;
}): TerrainHeightfieldResult {
  const {
    rows,
    cols,
    seed,
    width = 10,
    depth = 10,
    heightScale = 2.0,
    octaves = 3,
  } = opts;

  const vertRows = rows + 1;
  const vertCols = cols + 1;

  // Generate vertex grid with FBM heights
  const rng = createPRNG(seed + '-terrain-fbm');

  // Pre-generate prime coefficients per octave for FBM
  const octaveParams: { p1: number; p2: number; p3: number; p4: number; offset: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    octaveParams.push({
      p1: rng() * 3.0 + 1.0,
      p2: rng() * 3.0 + 1.0,
      p3: rng() * 3.0 + 1.0,
      p4: rng() * 3.0 + 1.0,
      offset: rng() * 100,
    });
  }

  function fbm(x: number, z: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.04;
    for (let o = 0; o < octaves; o++) {
      const p = octaveParams[o];
      value +=
        amplitude *
        Math.sin(frequency * x * p.p1 + frequency * z * p.p2 + p.offset) *
        Math.cos(frequency * x * p.p3 + frequency * z * p.p4 + p.offset);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  // Build vertex height grid
  const heights = new Float64Array(vertRows * vertCols);
  const vertX = new Float64Array(vertRows * vertCols);
  const vertZ = new Float64Array(vertRows * vertCols);

  for (let i = 0; i < vertRows; i++) {
    for (let j = 0; j < vertCols; j++) {
      const idx = i * vertCols + j;
      const x = (j / cols) * width - width / 2;
      const z = -(i / rows) * depth;
      vertX[idx] = x;
      vertZ[idx] = z;
      heights[idx] = fbm(x, z) * heightScale;
    }
  }

  // Build vertex position and random arrays
  const vertexCount = vertRows * vertCols;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandoms = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertRows; i++) {
    for (let j = 0; j < vertCols; j++) {
      const idx = i * vertCols + j;
      const base = idx * 3;
      vertexPositions[base] = vertX[idx];
      vertexPositions[base + 1] = heights[idx];
      vertexPositions[base + 2] = vertZ[idx];
      const r = hashRandomFromPosition(vertX[idx], heights[idx], vertZ[idx]);
      vertexRandoms[base] = r[0];
      vertexRandoms[base + 1] = r[1];
      vertexRandoms[base + 2] = r[2];
    }
  }

  // Edge count: horizontal edges + vertical edges
  // Horizontal: (rows+1) rows of cols edges each = vertRows * cols
  // Vertical: (cols+1) columns of rows edges each = vertCols * rows
  const horizontalEdges = vertRows * cols;
  const verticalEdges = vertCols * rows;
  const edgeCount = horizontalEdges + verticalEdges;

  // positions: 6 floats per edge (2 endpoints × vec3)
  const positions = new Float32Array(edgeCount * 6);
  // randoms: 6 floats per edge (hashRandomFromPosition per endpoint)
  const randoms = new Float32Array(edgeCount * 6);

  let edgeIdx = 0;

  // Horizontal edges: connect (i,j) -> (i,j+1)
  for (let i = 0; i < vertRows; i++) {
    for (let j = 0; j < cols; j++) {
      const idx0 = i * vertCols + j;
      const idx1 = i * vertCols + j + 1;
      const base = edgeIdx * 6;

      positions[base] = vertX[idx0];
      positions[base + 1] = heights[idx0];
      positions[base + 2] = vertZ[idx0];
      positions[base + 3] = vertX[idx1];
      positions[base + 4] = heights[idx1];
      positions[base + 5] = vertZ[idx1];

      const r0 = hashRandomFromPosition(vertX[idx0], heights[idx0], vertZ[idx0]);
      const r1 = hashRandomFromPosition(vertX[idx1], heights[idx1], vertZ[idx1]);
      randoms[base] = r0[0];
      randoms[base + 1] = r0[1];
      randoms[base + 2] = r0[2];
      randoms[base + 3] = r1[0];
      randoms[base + 4] = r1[1];
      randoms[base + 5] = r1[2];

      edgeIdx++;
    }
  }

  // Vertical edges: connect (i,j) -> (i+1,j)
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < vertCols; j++) {
      const idx0 = i * vertCols + j;
      const idx1 = (i + 1) * vertCols + j;
      const base = edgeIdx * 6;

      positions[base] = vertX[idx0];
      positions[base + 1] = heights[idx0];
      positions[base + 2] = vertZ[idx0];
      positions[base + 3] = vertX[idx1];
      positions[base + 4] = heights[idx1];
      positions[base + 5] = vertZ[idx1];

      const r0 = hashRandomFromPosition(vertX[idx0], heights[idx0], vertZ[idx0]);
      const r1 = hashRandomFromPosition(vertX[idx1], heights[idx1], vertZ[idx1]);
      randoms[base] = r0[0];
      randoms[base + 1] = r0[1];
      randoms[base + 2] = r0[2];
      randoms[base + 3] = r1[0];
      randoms[base + 4] = r1[1];
      randoms[base + 5] = r1[2];

      edgeIdx++;
    }
  }

  // Build triangle indices: 2 triangles per grid cell
  const triangleCount = rows * cols * 2;
  const triangleIndices = new Uint32Array(triangleCount * 3);
  let triIdx = 0;
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      const tl = i * vertCols + j;
      const tr = i * vertCols + j + 1;
      const bl = (i + 1) * vertCols + j;
      const br = (i + 1) * vertCols + j + 1;
      // Triangle 1: top-left, top-right, bottom-left
      triangleIndices[triIdx++] = tl;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = bl;
      // Triangle 2: top-right, bottom-right, bottom-left
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = bl;
    }
  }

  return { positions, randoms, vertexPositions, vertexRandoms, triangleIndices, triangleCount, edgeCount, vertexCount, rows, cols };
}

import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

/**
 * Canyon mesh: two vertical wall grids (left + right) combined.
 * Left wall at x = -6 + FBM displacement, right wall at x = 6 - FBM displacement.
 * Creates a narrow canyon corridor viewed from inside.
 */
export function generateCanyonMesh(
  seed: string,
  rows: number,
  cols: number,
  octaves: number,
): TriMeshGeometry {
  const depth = 80;
  const wallSpacing = 10.0;
  const yMin = -3;
  const yMax = 5;
  const displaceScale = 0.8;

  const rng = createPRNG(seed + ':canyon-fbm');

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

  function fbm(a: number, b: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 0.05;
    for (let o = 0; o < octaves; o++) {
      const p = octaveParams[o];
      value +=
        amplitude *
        Math.sin(frequency * a * p.p1 + frequency * b * p.p2 + p.offset) *
        Math.cos(frequency * a * p.p3 + frequency * b * p.p4 + p.offset);
      frequency *= 2;
      amplitude *= 0.5;
    }
    return value;
  }

  // rows = y segments, cols = z segments
  const vertRows = rows;
  const vertCols = cols;
  const singleVertexCount = vertRows * vertCols;
  const totalVertexCount = singleVertexCount * 2;

  const vertexPositions = new Float32Array(totalVertexCount * 3);
  const vertexRandoms = new Float32Array(totalVertexCount * 3);

  // Left wall
  for (let i = 0; i < vertRows; i++) {
    const y = yMin + (i / (vertRows - 1)) * (yMax - yMin);
    for (let j = 0; j < vertCols; j++) {
      const z = -(j / (vertCols - 1)) * depth;
      const idx = i * vertCols + j;
      const base = idx * 3;
      const x = -wallSpacing + fbm(y, z) * displaceScale;

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Right wall (offset seed by +50 in z)
  for (let i = 0; i < vertRows; i++) {
    const y = yMin + (i / (vertRows - 1)) * (yMax - yMin);
    for (let j = 0; j < vertCols; j++) {
      const z = -(j / (vertCols - 1)) * depth;
      const idx = singleVertexCount + i * vertCols + j;
      const base = idx * 3;
      const x = wallSpacing - fbm(y, z + 50) * displaceScale;

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Triangles for both walls
  const cellRows = vertRows - 1;
  const cellCols = vertCols - 1;
  const trianglesPerWall = cellRows * cellCols * 2;
  const totalTriangles = trianglesPerWall * 2;
  const triangleIndices = new Uint32Array(totalTriangles * 3);
  let triIdx = 0;

  // Left wall triangles
  for (let i = 0; i < cellRows; i++) {
    for (let j = 0; j < cellCols; j++) {
      const tl = i * vertCols + j;
      const tr = i * vertCols + j + 1;
      const bl = (i + 1) * vertCols + j;
      const br = (i + 1) * vertCols + j + 1;

      triangleIndices[triIdx++] = tl;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = bl;

      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = bl;
    }
  }

  // Right wall triangles
  for (let i = 0; i < cellRows; i++) {
    for (let j = 0; j < cellCols; j++) {
      const tl = singleVertexCount + i * vertCols + j;
      const tr = singleVertexCount + i * vertCols + j + 1;
      const bl = singleVertexCount + (i + 1) * vertCols + j;
      const br = singleVertexCount + (i + 1) * vertCols + j + 1;

      triangleIndices[triIdx++] = tl;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = bl;

      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = bl;
    }
  }

  return {
    vertexPositions,
    vertexRandoms,
    triangleIndices,
    vertexCount: totalVertexCount,
    triangleCount: totalTriangles,
  };
}

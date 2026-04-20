import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

/**
 * Cave mesh: two terrain grids (floor + ceiling) combined into one geometry.
 * Floor bumps upward, ceiling bumps downward, creating an enclosed cave corridor.
 */
export function generateCaveMesh(
  seed: string,
  rows: number,
  cols: number,
  octaves: number,
): TriMeshGeometry {
  const width = 60;
  const depth = 80;
  const floorBaseY = -4.0;
  const ceilBaseY = 6.0;
  const heightScale = 1.5;

  const rng = createPRNG(seed + ':cave-fbm');

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
    let frequency = 0.04;
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

  const vertRows = rows;
  const vertCols = cols;
  const singleVertexCount = vertRows * vertCols;
  const totalVertexCount = singleVertexCount * 2; // floor + ceiling

  const vertexPositions = new Float32Array(totalVertexCount * 3);
  const vertexRandoms = new Float32Array(totalVertexCount * 3);

  // Floor grid
  for (let i = 0; i < vertRows; i++) {
    for (let j = 0; j < vertCols; j++) {
      const idx = i * vertCols + j;
      const base = idx * 3;
      const x = (j / (vertCols - 1)) * width - width / 2;
      const z = -(i / (vertRows - 1)) * depth;
      const y = floorBaseY + Math.abs(fbm(x, z)) * heightScale;

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Ceiling grid (offset seed by adding 100 to z in fbm)
  for (let i = 0; i < vertRows; i++) {
    for (let j = 0; j < vertCols; j++) {
      const idx = singleVertexCount + i * vertCols + j;
      const base = idx * 3;
      const x = (j / (vertCols - 1)) * width - width / 2;
      const z = -(i / (vertRows - 1)) * depth;
      const y = ceilBaseY - Math.abs(fbm(x, z + 100)) * heightScale;

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Triangles for both grids
  const cellRows = vertRows - 1;
  const cellCols = vertCols - 1;
  const trianglesPerGrid = cellRows * cellCols * 2;
  const totalTriangles = trianglesPerGrid * 2;
  const triangleIndices = new Uint32Array(totalTriangles * 3);
  let triIdx = 0;

  // Floor triangles
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

  // Ceiling triangles (offset indices by singleVertexCount)
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

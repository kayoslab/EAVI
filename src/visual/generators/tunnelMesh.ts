import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

/**
 * Parametric cylinder tunnel mesh.
 * Grid: theta (0->2PI, rows segments) x z (0->-depth, cols segments).
 * FBM displacement on radius for organic tunnel walls.
 * Wraps theta so the last column connects to the first.
 */
export function generateTunnelMesh(
  seed: string,
  rows: number,
  cols: number,
  octaves: number,
): TriMeshGeometry {
  const depth = 80;
  const radius = 4.0;

  const rng = createPRNG(seed + ':tunnel-fbm');

  // Pre-generate FBM octave parameters
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
    let frequency = 0.08;
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

  // rows = theta segments, cols = z segments
  // Vertices: rows * (cols + 1) — wrapping theta means we reuse indices, not vertices
  const vertRows = rows; // theta segments (wraps)
  const vertCols = cols + 1; // z segments (open ends)
  const vertexCount = vertRows * vertCols;

  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandoms = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertRows; i++) {
    const theta = (i / rows) * Math.PI * 2;
    for (let j = 0; j < vertCols; j++) {
      const z = -(j / cols) * depth;
      const idx = i * vertCols + j;
      const base = idx * 3;

      const disp = fbm(theta, z * 0.05) * 0.8;
      const r = radius + disp;

      const x = r * Math.cos(theta);
      const y = r * Math.sin(theta);

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Triangles: 2 per cell, wrapping theta
  const cellRows = vertRows; // wraps
  const cellCols = cols;
  const triangleCount = cellRows * cellCols * 2;
  const triangleIndices = new Uint32Array(triangleCount * 3);
  let triIdx = 0;

  for (let i = 0; i < cellRows; i++) {
    const nextI = (i + 1) % vertRows; // wrap theta
    for (let j = 0; j < cellCols; j++) {
      const tl = i * vertCols + j;
      const tr = i * vertCols + j + 1;
      const bl = nextI * vertCols + j;
      const br = nextI * vertCols + j + 1;

      triangleIndices[triIdx++] = tl;
      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = bl;

      triangleIndices[triIdx++] = tr;
      triangleIndices[triIdx++] = br;
      triangleIndices[triIdx++] = bl;
    }
  }

  return { vertexPositions, vertexRandoms, triangleIndices, vertexCount, triangleCount };
}

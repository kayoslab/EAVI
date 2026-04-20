import { createPRNG } from '../prng';
import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

/**
 * Parametric torus mesh.
 * theta (major angle, rows segments) x phi (minor angle, cols segments).
 * FBM displacement along surface normal direction.
 * Wraps both theta and phi.
 */
export function generateTorusMesh(
  seed: string,
  rows: number,
  cols: number,
  octaves: number,
): TriMeshGeometry {
  const R = 2.0; // major radius
  const r = 0.8; // minor radius

  const rng = createPRNG(seed + ':torus-fbm');

  const octaveParams: { p1: number; p2: number; p3: number; p4: number; offset: number }[] = [];
  for (let o = 0; o < octaves; o++) {
    octaveParams.push({
      p1: rng() * 100 + 10,
      p2: rng() * 100 + 10,
      p3: rng() * 100 + 10,
      p4: rng() * 100 + 10,
      offset: rng() * 1000,
    });
  }

  function fbm(a: number, b: number): number {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
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

  const vertexCount = rows * cols;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandoms = new Float32Array(vertexCount * 3);

  for (let i = 0; i < rows; i++) {
    const theta = (i / rows) * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);

    for (let j = 0; j < cols; j++) {
      const phi = (j / cols) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const idx = i * cols + j;
      const base = idx * 3;

      const disp = fbm(theta, phi) * 0.2;

      const x = (R + (r + disp) * cosPhi) * cosTheta;
      const y = (r + disp) * sinPhi;
      const z = (R + (r + disp) * cosPhi) * sinTheta;

      vertexPositions[base] = x;
      vertexPositions[base + 1] = y;
      vertexPositions[base + 2] = z;

      const rnd = hashRandomFromPosition(x, y, z);
      vertexRandoms[base] = rnd[0];
      vertexRandoms[base + 1] = rnd[1];
      vertexRandoms[base + 2] = rnd[2];
    }
  }

  // Triangles: 2 per cell, wrapping both theta and phi
  const triangleCount = rows * cols * 2;
  const triangleIndices = new Uint32Array(triangleCount * 3);
  let triIdx = 0;

  for (let i = 0; i < rows; i++) {
    const nextI = (i + 1) % rows;
    for (let j = 0; j < cols; j++) {
      const nextJ = (j + 1) % cols;

      const tl = i * cols + j;
      const tr = i * cols + nextJ;
      const bl = nextI * cols + j;
      const br = nextI * cols + nextJ;

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

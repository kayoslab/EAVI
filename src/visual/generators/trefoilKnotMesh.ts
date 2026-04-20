import { hashRandomFromPosition } from './subdivideEdges';
import type { TriMeshGeometry } from '../systems/triMeshMode';

export function generateTrefoilKnotMesh(
  seed: string,
  rows: number, // tube segments around the knot path
  cols: number, // tube cross-section segments
  _octaves: number,
): TriMeshGeometry {
  // Suppress unused parameter warning
  void seed;

  const pathSegments = Math.max(20, rows);
  const tubeSegments = Math.max(8, Math.min(cols, 24));
  const knotRadius = 2.0;
  const tubeRadius = 0.5;

  const vertexCount = pathSegments * tubeSegments;
  const vertexPositions = new Float32Array(vertexCount * 3);
  const vertexRandoms = new Float32Array(vertexCount * 3);

  // Trefoil knot parametric curve: x = sin(t) + 2*sin(2t), y = cos(t) - 2*cos(2t), z = -sin(3t)
  function knotPoint(t: number): [number, number, number] {
    return [
      (Math.sin(t) + 2 * Math.sin(2 * t)) * knotRadius * 0.4,
      (Math.cos(t) - 2 * Math.cos(2 * t)) * knotRadius * 0.4,
      -Math.sin(3 * t) * knotRadius * 0.4,
    ];
  }

  // Compute tangent via finite difference
  function knotTangent(t: number): [number, number, number] {
    const dt = 0.001;
    const a = knotPoint(t - dt);
    const b = knotPoint(t + dt);
    const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1;
    return [dx / len, dy / len, dz / len];
  }

  // Build tube vertices
  for (let i = 0; i < pathSegments; i++) {
    const t = (i / pathSegments) * Math.PI * 2;
    const [cx, cy, cz] = knotPoint(t);
    const [tx, ty, tz] = knotTangent(t);

    // Compute normal and binormal via arbitrary vector cross
    let nx = 0, ny = 1, nz = 0;
    if (Math.abs(ty) > 0.9) { nx = 1; ny = 0; }
    // Cross tangent x arbitrary = binormal
    let bnx = ty * nz - tz * ny;
    let bny = tz * nx - tx * nz;
    let bnz = tx * ny - ty * nx;
    const bnLen = Math.sqrt(bnx * bnx + bny * bny + bnz * bnz) || 1;
    bnx /= bnLen; bny /= bnLen; bnz /= bnLen;
    // Cross tangent x binormal = true normal
    nx = ty * bnz - tz * bny;
    ny = tz * bnx - tx * bnz;
    nz = tx * bny - ty * bnx;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nLen; ny /= nLen; nz /= nLen;

    for (let j = 0; j < tubeSegments; j++) {
      const phi = (j / tubeSegments) * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);

      const vx = cx + tubeRadius * (cosPhi * nx + sinPhi * bnx);
      const vy = cy + tubeRadius * (cosPhi * ny + sinPhi * bny);
      const vz = cz + tubeRadius * (cosPhi * nz + sinPhi * bnz);

      const idx = i * tubeSegments + j;
      vertexPositions[idx * 3] = vx;
      vertexPositions[idx * 3 + 1] = vy;
      vertexPositions[idx * 3 + 2] = vz;

      const r = hashRandomFromPosition(vx, vy, vz);
      vertexRandoms[idx * 3] = r[0];
      vertexRandoms[idx * 3 + 1] = r[1];
      vertexRandoms[idx * 3 + 2] = r[2];
    }
  }

  // Build triangle indices: wrap both path and tube (closed surface)
  const triangleCount = pathSegments * tubeSegments * 2;
  const triangleIndices = new Uint32Array(triangleCount * 3);
  let triIdx = 0;

  for (let i = 0; i < pathSegments; i++) {
    const nextI = (i + 1) % pathSegments;
    for (let j = 0; j < tubeSegments; j++) {
      const nextJ = (j + 1) % tubeSegments;
      const a = i * tubeSegments + j;
      const b = i * tubeSegments + nextJ;
      const c = nextI * tubeSegments + j;
      const d = nextI * tubeSegments + nextJ;
      // Triangle 1
      triangleIndices[triIdx++] = a;
      triangleIndices[triIdx++] = b;
      triangleIndices[triIdx++] = c;
      // Triangle 2
      triangleIndices[triIdx++] = b;
      triangleIndices[triIdx++] = d;
      triangleIndices[triIdx++] = c;
    }
  }

  return { vertexPositions, vertexRandoms, triangleIndices, vertexCount, triangleCount };
}

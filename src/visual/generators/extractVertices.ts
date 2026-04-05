import { hashRandomFromPosition } from './subdivideEdges';

export interface VertexData {
  positions: Float32Array;
  aRandom: Float32Array;
  vertexCount: number;
}

/**
 * Extract unique vertex positions from LineSegments edge data.
 * Edge data has duplicated vertices at shared endpoints; this deduplicates
 * them and computes position-based aRandom for each unique vertex.
 */
export function extractUniqueVertices(edgePositions: Float32Array): VertexData {
  if (edgePositions.length === 0) {
    return { positions: new Float32Array(0), aRandom: new Float32Array(0), vertexCount: 0 };
  }

  const vertCount = edgePositions.length / 3;
  const posMap = new Map<string, number>();
  const uniquePositions: number[] = [];

  for (let i = 0; i < vertCount; i++) {
    const x = edgePositions[i * 3];
    const y = edgePositions[i * 3 + 1];
    const z = edgePositions[i * 3 + 2];
    const key = `${Math.round(x * 1e6)},${Math.round(y * 1e6)},${Math.round(z * 1e6)}`;

    if (!posMap.has(key)) {
      posMap.set(key, uniquePositions.length / 3);
      uniquePositions.push(x, y, z);
    }
  }

  const count = uniquePositions.length / 3;
  const positions = new Float32Array(uniquePositions);
  const aRandom = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const [r0, r1, r2] = hashRandomFromPosition(
      positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2],
    );
    aRandom[i * 3] = r0;
    aRandom[i * 3 + 1] = r1;
    aRandom[i * 3 + 2] = r2;
  }

  return { positions, aRandom, vertexCount: count };
}

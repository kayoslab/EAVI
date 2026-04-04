/**
 * Edge subdivision utility for electric arc displacement.
 * Tessellates LineSegments edges into sub-segments with parametric attributes
 * so the vertex shader can apply lateral noise-based displacement.
 */

export interface SubdivisionResult {
  positions: Float32Array;
  aEdgeParam: Float32Array;
  aEdgeTangent: Float32Array;
  aRandom: Float32Array;
}

/**
 * Subdivide each edge (pair of vec3 vertices) into N sub-segments.
 * Output is in LineSegments format: consecutive pairs of vertices.
 *
 * @param positions - Flat Float32Array of LineSegments positions (pairs of vec3)
 * @param subdivisions - Number of sub-segments per original edge (must be >= 1)
 */
export function subdivideEdges(
  positions: Float32Array,
  subdivisions: number,
): SubdivisionResult {
  const edgeCount = Math.floor(positions.length / 6);
  if (edgeCount === 0 || subdivisions < 1) {
    return {
      positions: new Float32Array(0),
      aEdgeParam: new Float32Array(0),
      aEdgeTangent: new Float32Array(0),
      aRandom: new Float32Array(0),
    };
  }

  // Each edge produces `subdivisions` sub-segments, each sub-segment = 2 vertices
  const outVertCount = edgeCount * subdivisions * 2;
  const outPositions = new Float32Array(outVertCount * 3);
  const outParam = new Float32Array(outVertCount);
  const outTangent = new Float32Array(outVertCount * 3);
  const outRandom = new Float32Array(outVertCount * 3);

  for (let e = 0; e < edgeCount; e++) {
    const base = e * 6;
    const v0x = positions[base];
    const v0y = positions[base + 1];
    const v0z = positions[base + 2];
    const v1x = positions[base + 3];
    const v1y = positions[base + 4];
    const v1z = positions[base + 5];

    // Edge direction
    const dx = v1x - v0x;
    const dy = v1y - v0y;
    const dz = v1z - v0z;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

    // Normalized tangent (fallback to (1,0,0) for zero-length edges)
    let tx: number, ty: number, tz: number;
    if (len > 1e-8) {
      tx = dx / len;
      ty = dy / len;
      tz = dz / len;
    } else {
      tx = 1;
      ty = 0;
      tz = 0;
    }

    const outBase = e * subdivisions * 2;

    for (let s = 0; s < subdivisions; s++) {
      const t0 = s / subdivisions;
      const t1 = (s + 1) / subdivisions;

      // Interpolated positions along edge
      const p0x = v0x + dx * t0;
      const p0y = v0y + dy * t0;
      const p0z = v0z + dz * t0;
      const p1x = v0x + dx * t1;
      const p1y = v0y + dy * t1;
      const p1z = v0z + dz * t1;

      // Tapered edge param: sin(PI * t) gives 0 at endpoints, 1 at midpoint
      const param0 = Math.sin(Math.PI * t0);
      const param1 = Math.sin(Math.PI * t1);

      const vi0 = outBase + s * 2;
      const vi1 = vi0 + 1;

      // Positions
      outPositions[vi0 * 3] = p0x;
      outPositions[vi0 * 3 + 1] = p0y;
      outPositions[vi0 * 3 + 2] = p0z;
      outPositions[vi1 * 3] = p1x;
      outPositions[vi1 * 3 + 1] = p1y;
      outPositions[vi1 * 3 + 2] = p1z;

      // Edge param (tapered)
      outParam[vi0] = param0;
      outParam[vi1] = param1;

      // Tangent (same for all vertices on one edge)
      outTangent[vi0 * 3] = tx;
      outTangent[vi0 * 3 + 1] = ty;
      outTangent[vi0 * 3 + 2] = tz;
      outTangent[vi1 * 3] = tx;
      outTangent[vi1 * 3 + 1] = ty;
      outTangent[vi1 * 3 + 2] = tz;

      // Per-vertex random seeded from position (deterministic)
      outRandom[vi0 * 3] = Math.abs(Math.sin(p0x * 73.1 + p0y * 91.3 + p0z * 117.7)) % 1;
      outRandom[vi0 * 3 + 1] = Math.abs(Math.cos(p0x * 43.7 + p0y * 67.1 + p0z * 31.9)) % 1;
      outRandom[vi0 * 3 + 2] = Math.abs(Math.sin(p0x * 17.3 + p0y * 53.9 + p0z * 89.1)) % 1;
      outRandom[vi1 * 3] = Math.abs(Math.sin(p1x * 73.1 + p1y * 91.3 + p1z * 117.7)) % 1;
      outRandom[vi1 * 3 + 1] = Math.abs(Math.cos(p1x * 43.7 + p1y * 67.1 + p1z * 31.9)) % 1;
      outRandom[vi1 * 3 + 2] = Math.abs(Math.sin(p1x * 17.3 + p1y * 53.9 + p1z * 89.1)) % 1;
    }
  }

  return {
    positions: outPositions,
    aEdgeParam: outParam,
    aEdgeTangent: outTangent,
    aRandom: outRandom,
  };
}

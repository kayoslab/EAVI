/**
 * Bezier curve tessellation utility for web connections between point pairs.
 * Tessellates quadratic Bezier curves into LineSegments format with
 * per-vertex arc offset attributes for shader-side bass modulation.
 */

export interface BezierTessellationResult {
  /** Flat positions along the straight line between endpoints (vec3 per vertex) */
  positions: Float32Array;
  /** Perpendicular arc offset vectors (vec3 per vertex), weighted by sin(t*PI) bell curve */
  aArcOffset: Float32Array;
  /** Parametric t value along the curve (0 at start, 1 at end) */
  aEdgeParam: Float32Array;
  /** Per-vertex deterministic random values (vec3) */
  aRandom: Float32Array;
}

/**
 * Tessellate a quadratic Bezier curve between two 3D points into LineSegments format.
 *
 * The control point is offset perpendicular to the pair axis at the midpoint.
 * Rather than baking the curve into positions, we store the flat (straight-line)
 * positions and the perpendicular arc offset separately so the vertex shader
 * can modulate arc height with bass energy in real time.
 *
 * @param ax - Point A x
 * @param ay - Point A y
 * @param az - Point A z
 * @param bx - Point B x
 * @param by - Point B y
 * @param bz - Point B z
 * @param segments - Number of line segments to tessellate into (4-6 recommended)
 * @param arcHeight - Base perpendicular offset magnitude for the control point
 */
export function tessellateBezier(
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  segments: number,
  arcHeight: number,
): BezierTessellationResult {
  // Each segment = 2 vertices in LineSegments format
  const vertexCount = segments * 2;
  const positions = new Float32Array(vertexCount * 3);
  const aArcOffset = new Float32Array(vertexCount * 3);
  const aEdgeParam = new Float32Array(vertexCount);
  const aRandom = new Float32Array(vertexCount * 3);

  // Pair axis
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);

  // Compute perpendicular direction via cross product with a reference vector.
  // Use Y-axis as reference; fall back to X-axis if pair axis is near-parallel to Y.
  let perpX: number, perpY: number, perpZ: number;

  if (len < 1e-8) {
    // Degenerate case: identical points — no meaningful perpendicular
    perpX = 0;
    perpY = 0;
    perpZ = 0;
  } else {
    const ndx = dx / len;
    const ndy = dy / len;
    const ndz = dz / len;

    // Reference vector: try Y-axis first
    let refX = 0, refY = 1, refZ = 0;
    const dotRef = Math.abs(ndx * refX + ndy * refY + ndz * refZ);
    if (dotRef > 0.9) {
      // Near-parallel to Y — use X-axis instead
      refX = 1; refY = 0; refZ = 0;
    }

    // Cross product: pairAxis x refVector
    let cx = ndy * refZ - ndz * refY;
    let cy = ndz * refX - ndx * refZ;
    let cz = ndx * refY - ndy * refX;
    const cLen = Math.sqrt(cx * cx + cy * cy + cz * cz);

    if (cLen > 1e-8) {
      perpX = (cx / cLen) * arcHeight;
      perpY = (cy / cLen) * arcHeight;
      perpZ = (cz / cLen) * arcHeight;
    } else {
      perpX = 0;
      perpY = 0;
      perpZ = 0;
    }
  }

  for (let s = 0; s < segments; s++) {
    const t0 = s / segments;
    const t1 = (s + 1) / segments;

    // Flat interpolated positions along the straight line A->B
    const p0x = ax + dx * t0;
    const p0y = ay + dy * t0;
    const p0z = az + dz * t0;
    const p1x = ax + dx * t1;
    const p1y = ay + dy * t1;
    const p1z = az + dz * t1;

    // Bell-curve weighting: sin(t * PI) — zero at endpoints, max at midpoint
    const w0 = Math.sin(t0 * Math.PI);
    const w1 = Math.sin(t1 * Math.PI);

    const vi0 = s * 2;
    const vi1 = vi0 + 1;

    // Positions (flat line)
    positions[vi0 * 3] = p0x;
    positions[vi0 * 3 + 1] = p0y;
    positions[vi0 * 3 + 2] = p0z;
    positions[vi1 * 3] = p1x;
    positions[vi1 * 3 + 1] = p1y;
    positions[vi1 * 3 + 2] = p1z;

    // Arc offset (perpendicular * bell weight)
    aArcOffset[vi0 * 3] = perpX * w0;
    aArcOffset[vi0 * 3 + 1] = perpY * w0;
    aArcOffset[vi0 * 3 + 2] = perpZ * w0;
    aArcOffset[vi1 * 3] = perpX * w1;
    aArcOffset[vi1 * 3 + 1] = perpY * w1;
    aArcOffset[vi1 * 3 + 2] = perpZ * w1;

    // Edge param (raw t value, 0 to 1)
    aEdgeParam[vi0] = t0;
    aEdgeParam[vi1] = t1;

    // Per-vertex deterministic random (seeded from position)
    aRandom[vi0 * 3] = Math.abs(Math.sin(p0x * 73.1 + p0y * 91.3 + p0z * 117.7)) % 1;
    aRandom[vi0 * 3 + 1] = Math.abs(Math.cos(p0x * 43.7 + p0y * 67.1 + p0z * 31.9)) % 1;
    aRandom[vi0 * 3 + 2] = Math.abs(Math.sin(p0x * 17.3 + p0y * 53.9 + p0z * 89.1)) % 1;
    aRandom[vi1 * 3] = Math.abs(Math.sin(p1x * 73.1 + p1y * 91.3 + p1z * 117.7)) % 1;
    aRandom[vi1 * 3 + 1] = Math.abs(Math.cos(p1x * 43.7 + p1y * 67.1 + p1z * 31.9)) % 1;
    aRandom[vi1 * 3 + 2] = Math.abs(Math.sin(p1x * 17.3 + p1y * 53.9 + p1z * 89.1)) % 1;
  }

  return { positions, aArcOffset, aEdgeParam, aRandom };
}

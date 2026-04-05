import { describe, it, expect } from 'vitest';
import { tessellateBezier } from '../../../src/visual/generators/tessellateBezier';

describe('US-067: tessellateBezier', () => {
  it('T-067-01: produces correct vertex count for LineSegments format (segments * 2 per pair)', () => {
    const result = tessellateBezier(0, 0, 0, 1, 0, 0, 5, 0.15);
    expect(result.positions.length).toBe(5 * 2 * 3);
    expect(result.aEdgeParam.length).toBe(5 * 2);
    expect(result.aArcOffset.length).toBe(5 * 2 * 3);
  });

  it('T-067-02: tessellated curve endpoints match the original input points', () => {
    const ax = 1, ay = 2, az = 3;
    const bx = 4, by = 5, bz = 6;
    const result = tessellateBezier(ax, ay, az, bx, by, bz, 5, 0.15);

    // First vertex of first segment should match point A
    expect(result.positions[0]).toBeCloseTo(ax, 5);
    expect(result.positions[1]).toBeCloseTo(ay, 5);
    expect(result.positions[2]).toBeCloseTo(az, 5);

    // Last vertex of last segment should match point B
    const lastIdx = (5 * 2 - 1) * 3;
    expect(result.positions[lastIdx]).toBeCloseTo(bx, 5);
    expect(result.positions[lastIdx + 1]).toBeCloseTo(by, 5);
    expect(result.positions[lastIdx + 2]).toBeCloseTo(bz, 5);
  });

  it('T-067-03: control point offset is perpendicular to the pair axis', () => {
    const result = tessellateBezier(0, 0, 0, 2, 0, 0, 5, 1.0);

    // Pair axis direction is (1, 0, 0)
    // Find midpoint vertex (vertex index ~5 in a 10-vertex array)
    const midIdx = 5; // vertex at t=0.5 (second vertex of segment 2, or first of segment 3)
    const ox = result.aArcOffset[midIdx * 3];
    const oy = result.aArcOffset[midIdx * 3 + 1];
    const oz = result.aArcOffset[midIdx * 3 + 2];

    // Dot product with pair axis (1,0,0) should be ~0
    const dot = ox * 1 + oy * 0 + oz * 0;
    expect(Math.abs(dot)).toBeLessThan(0.01);

    // Magnitude should be non-zero
    const mag = Math.sqrt(ox * ox + oy * oy + oz * oz);
    expect(mag).toBeGreaterThan(0);
  });

  it('T-067-04: aEdgeParam values range from 0 to 1 along the curve', () => {
    const result = tessellateBezier(0, 0, 0, 1, 1, 1, 5, 0.15);

    expect(result.aEdgeParam[0]).toBe(0);
    expect(result.aEdgeParam[result.aEdgeParam.length - 1]).toBe(1);

    for (let i = 0; i < result.aEdgeParam.length; i++) {
      expect(result.aEdgeParam[i]).toBeGreaterThanOrEqual(0);
      expect(result.aEdgeParam[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-067-05: aArcOffset has bell-curve weighting (zero at endpoints, max at midpoint)', () => {
    const result = tessellateBezier(0, 0, 0, 2, 0, 0, 6, 1.0);

    function offsetMag(vi: number): number {
      const x = result.aArcOffset[vi * 3];
      const y = result.aArcOffset[vi * 3 + 1];
      const z = result.aArcOffset[vi * 3 + 2];
      return Math.sqrt(x * x + y * y + z * z);
    }

    // First vertex (t=0) should have zero or near-zero offset
    expect(offsetMag(0)).toBeLessThan(0.01);

    // Last vertex (t=1) should have zero or near-zero offset
    expect(offsetMag(6 * 2 - 1)).toBeLessThan(0.01);

    // Midpoint vertex should have greater offset than endpoints
    const midVi = 6; // roughly at midpoint
    expect(offsetMag(midVi)).toBeGreaterThan(offsetMag(0));
  });

  it('T-067-06: tessellation with segments=4 and segments=6 both produce valid output', () => {
    const r4 = tessellateBezier(0, 0, 0, 1, 1, 1, 4, 0.15);
    expect(r4.positions.length).toBe(4 * 2 * 3);
    expect(r4.aEdgeParam.length).toBe(4 * 2);
    expect(r4.aArcOffset.length).toBe(4 * 2 * 3);
    expect(r4.aRandom.length).toBe(4 * 2 * 3);

    const r6 = tessellateBezier(0, 0, 0, 1, 1, 1, 6, 0.15);
    expect(r6.positions.length).toBe(6 * 2 * 3);
    expect(r6.aEdgeParam.length).toBe(6 * 2);
    expect(r6.aArcOffset.length).toBe(6 * 2 * 3);
    expect(r6.aRandom.length).toBe(6 * 2 * 3);
  });

  it('T-067-07: degenerate input: identical points A and B produce valid output without NaN', () => {
    expect(() => tessellateBezier(1, 2, 3, 1, 2, 3, 5, 0.15)).not.toThrow();
    const result = tessellateBezier(1, 2, 3, 1, 2, 3, 5, 0.15);

    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isNaN(result.positions[i])).toBe(false);
    }
    for (let i = 0; i < result.aArcOffset.length; i++) {
      expect(Number.isNaN(result.aArcOffset[i])).toBe(false);
    }
  });

  it('T-067-08: perpendicular fallback works when pair axis is aligned with reference vector', () => {
    // Pair axis aligned with Y-axis (the default reference vector)
    const result = tessellateBezier(0, 0, 0, 0, 5, 0, 5, 1.0);

    // Midpoint should still have non-zero arc offset
    const midVi = 5;
    const ox = result.aArcOffset[midVi * 3];
    const oy = result.aArcOffset[midVi * 3 + 1];
    const oz = result.aArcOffset[midVi * 3 + 2];
    const mag = Math.sqrt(ox * ox + oy * oy + oz * oz);
    expect(mag).toBeGreaterThan(0);

    // No NaN
    for (let i = 0; i < result.positions.length; i++) {
      expect(Number.isNaN(result.positions[i])).toBe(false);
    }
  });

  it('T-067-09: arcHeight parameter scales the offset magnitude', () => {
    const r1 = tessellateBezier(0, 0, 0, 2, 0, 0, 5, 1.0);
    const r2 = tessellateBezier(0, 0, 0, 2, 0, 0, 5, 2.0);

    // Compare midpoint arc offset magnitudes
    const midVi = 5;
    function mag(arr: Float32Array, vi: number): number {
      const x = arr[vi * 3];
      const y = arr[vi * 3 + 1];
      const z = arr[vi * 3 + 2];
      return Math.sqrt(x * x + y * y + z * z);
    }

    const m1 = mag(r1.aArcOffset, midVi);
    const m2 = mag(r2.aArcOffset, midVi);

    // arcHeight=2 should be ~2x arcHeight=1
    expect(m2).toBeCloseTo(m1 * 2, 3);
  });

  it('T-067-10: output is deterministic for the same input', () => {
    const a = tessellateBezier(1, 2, 3, 4, 5, 6, 5, 0.15);
    const b = tessellateBezier(1, 2, 3, 4, 5, 6, 5, 0.15);

    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
    expect(Array.from(a.aEdgeParam)).toEqual(Array.from(b.aEdgeParam));
    expect(Array.from(a.aArcOffset)).toEqual(Array.from(b.aArcOffset));
  });
});

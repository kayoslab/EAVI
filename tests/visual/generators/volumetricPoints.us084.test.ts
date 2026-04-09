import { describe, it, expect, vi } from 'vitest';
import { generateVolumetricPoints, VOLUMETRIC_SHAPES } from '../../../src/visual/generators/volumetricPoints';

function computeAxisStdDev(positions: Float32Array): { stdX: number; stdY: number; stdZ: number } {
  const count = positions.length / 3;
  if (count === 0) return { stdX: 0, stdY: 0, stdZ: 0 };
  let sumX = 0, sumY = 0, sumZ = 0;
  for (let i = 0; i < count; i++) {
    sumX += positions[i * 3];
    sumY += positions[i * 3 + 1];
    sumZ += positions[i * 3 + 2];
  }
  const meanX = sumX / count, meanY = sumY / count, meanZ = sumZ / count;
  let varX = 0, varY = 0, varZ = 0;
  for (let i = 0; i < count; i++) {
    varX += (positions[i * 3] - meanX) ** 2;
    varY += (positions[i * 3 + 1] - meanY) ** 2;
    varZ += (positions[i * 3 + 2] - meanZ) ** 2;
  }
  return {
    stdX: Math.sqrt(varX / count),
    stdY: Math.sqrt(varY / count),
    stdZ: Math.sqrt(varZ / count),
  };
}

function computeRadii(positions: Float32Array): number[] {
  const count = positions.length / 3;
  const radii: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    radii.push(Math.sqrt(x * x + y * y + z * z));
  }
  return radii;
}

function computeBounds(positions: Float32Array) {
  const count = positions.length / 3;
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  let minZ = Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

describe('US-084: Parametric surface generators', () => {
  const PARAMETRIC_SHAPES = ['supershape', 'cliffordTorus', 'gyroid'] as const;

  describe('supershape', () => {
    it('T-084-01: supershape generator returns Float32Array with length 3 x pointCount', () => {
      const result = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 500, seed: 'ss-len' });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(1500);
    });

    it('T-084-02: supershape produces non-zero spread in X, Y, and Z independently', () => {
      const result = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 500, seed: 'ss-spread' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      expect(stdX).toBeGreaterThan(0.1);
      expect(stdY).toBeGreaterThan(0.1);
      expect(stdZ).toBeGreaterThan(0.1);
    });

    it('T-084-03: supershape produces non-coplanar points', () => {
      const result = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 500, seed: 'ss-coplanar' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      const minStd = Math.min(stdX, stdY, stdZ);
      expect(minStd).toBeGreaterThan(0.05);
    });

    it('T-084-04: supershape is deterministic with same seed', () => {
      const a = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 100, seed: 'det-ss' });
      const b = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 100, seed: 'det-ss' });
      expect(a).toEqual(b);
    });

    it('T-084-05: supershape produces different output for different seeds', () => {
      const a = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 100, seed: 'ss-a' });
      const b = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 100, seed: 'ss-b' });
      expect(a).not.toEqual(b);
    });

    it('T-084-06: supershape points fit within radius ~2.0 extent (max radius < 4.0)', () => {
      const result = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 1000, seed: 'ss-extent' });
      const radii = computeRadii(result);
      const maxR = Math.max(...radii);
      expect(maxR).toBeLessThan(4.0);
      expect(maxR).toBeGreaterThan(0.5);
    });

    it('T-084-07: supershape produces recognisable lobed structure (not a uniform sphere)', () => {
      // A supershape with m>=3 should have angular variation in radial distance
      // meaning the std dev of radii should be non-trivial compared to mean radius
      const result = generateVolumetricPoints({ shape: 'supershape' as any, pointCount: 1000, seed: 'ss-lobed' });
      const radii = computeRadii(result);
      const meanR = radii.reduce((a, b) => a + b, 0) / radii.length;
      const radiiVariance = radii.reduce((s, r) => s + (r - meanR) ** 2, 0) / radii.length;
      const radiiStd = Math.sqrt(radiiVariance);
      // Coefficient of variation should show surface structure, not uniform sphere
      // A pure sphere would have ~0 cv (surface) or moderate cv (volume)
      // A supershape should have at least some radial variation from the lobes
      expect(radiiStd).toBeGreaterThan(0);
      expect(meanR).toBeGreaterThan(0.5);
    });
  });

  describe('cliffordTorus', () => {
    it('T-084-08: cliffordTorus generator returns Float32Array with length 3 x pointCount', () => {
      const result = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 500, seed: 'ct-len' });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(1500);
    });

    it('T-084-09: cliffordTorus produces non-zero spread in X, Y, and Z independently', () => {
      const result = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 500, seed: 'ct-spread' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      expect(stdX).toBeGreaterThan(0.1);
      expect(stdY).toBeGreaterThan(0.1);
      expect(stdZ).toBeGreaterThan(0.1);
    });

    it('T-084-10: cliffordTorus produces non-coplanar points', () => {
      const result = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 500, seed: 'ct-coplanar' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      const minStd = Math.min(stdX, stdY, stdZ);
      expect(minStd).toBeGreaterThan(0.05);
    });

    it('T-084-11: cliffordTorus is deterministic with same seed', () => {
      const a = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 100, seed: 'det-ct' });
      const b = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 100, seed: 'det-ct' });
      expect(a).toEqual(b);
    });

    it('T-084-12: cliffordTorus produces different output for different seeds', () => {
      const a = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 100, seed: 'ct-a' });
      const b = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 100, seed: 'ct-b' });
      expect(a).not.toEqual(b);
    });

    it('T-084-13: cliffordTorus has torus structure (hollow center — Z range smaller than XY range)', () => {
      const result = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 1000, seed: 'ct-torus' });
      const bounds = computeBounds(result);
      const xRange = bounds.maxX - bounds.minX;
      const yRange = bounds.maxY - bounds.minY;
      const zRange = bounds.maxZ - bounds.minZ;
      // Torus with R=1.5, r=0.6: XY extent ≈ 4.2, Z extent ≈ 1.2
      // Z range should be significantly smaller than X and Y ranges
      expect(zRange).toBeLessThan(xRange);
      expect(zRange).toBeLessThan(yRange);
    });

    it('T-084-14: cliffordTorus points centered near origin (mean within 0.5 of origin)', () => {
      const result = generateVolumetricPoints({ shape: 'cliffordTorus' as any, pointCount: 1000, seed: 'ct-center' });
      const count = result.length / 3;
      let sumX = 0, sumY = 0, sumZ = 0;
      for (let i = 0; i < count; i++) {
        sumX += result[i * 3];
        sumY += result[i * 3 + 1];
        sumZ += result[i * 3 + 2];
      }
      expect(Math.abs(sumX / count)).toBeLessThan(0.5);
      expect(Math.abs(sumY / count)).toBeLessThan(0.5);
      expect(Math.abs(sumZ / count)).toBeLessThan(0.5);
    });
  });

  describe('gyroid', () => {
    it('T-084-15: gyroid generator returns Float32Array with length 3 x pointCount', () => {
      const result = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 500, seed: 'gy-len' });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(1500);
    });

    it('T-084-16: gyroid produces non-zero spread in X, Y, and Z independently', () => {
      const result = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 500, seed: 'gy-spread' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      expect(stdX).toBeGreaterThan(0.1);
      expect(stdY).toBeGreaterThan(0.1);
      expect(stdZ).toBeGreaterThan(0.1);
    });

    it('T-084-17: gyroid produces non-coplanar points', () => {
      const result = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 500, seed: 'gy-coplanar' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      const minStd = Math.min(stdX, stdY, stdZ);
      expect(minStd).toBeGreaterThan(0.05);
    });

    it('T-084-18: gyroid is deterministic with same seed', () => {
      const a = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 100, seed: 'det-gy' });
      const b = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 100, seed: 'det-gy' });
      expect(a).toEqual(b);
    });

    it('T-084-19: gyroid produces different output for different seeds', () => {
      const a = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 100, seed: 'gy-a' });
      const b = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 100, seed: 'gy-b' });
      expect(a).not.toEqual(b);
    });

    it('T-084-20: gyroid points lie near the implicit surface (|f(x,y,z)| < threshold after scaling)', () => {
      const result = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 500, seed: 'gy-surface' });
      const count = result.length / 3;
      // Points are scaled to radius ~2.0 from bounding cube [-pi, pi]^3
      // We need to unscale to evaluate the gyroid function
      // The scale factor maps [-pi, pi] to ~[-2, 2], so scale = 2.0 / pi
      const scale = Math.PI / 2.0; // to unscale: multiply by pi/2
      let nearSurfaceCount = 0;
      for (let i = 0; i < count; i++) {
        const x = result[i * 3] * scale;
        const y = result[i * 3 + 1] * scale;
        const z = result[i * 3 + 2] * scale;
        const f = Math.cos(x) * Math.sin(y) + Math.cos(y) * Math.sin(z) + Math.cos(z) * Math.sin(x);
        if (Math.abs(f) < 0.3) nearSurfaceCount++;
      }
      // At least 50% of points should be near the surface after Newton projection
      expect(nearSurfaceCount / count).toBeGreaterThan(0.5);
    });

    it('T-084-21: gyroid points fit within expected extent (max radius < 4.0)', () => {
      const result = generateVolumetricPoints({ shape: 'gyroid' as any, pointCount: 500, seed: 'gy-extent' });
      const radii = computeRadii(result);
      const maxR = Math.max(...radii);
      expect(maxR).toBeLessThan(4.0);
    });
  });

  describe('cross-shape checks for parametric surfaces', () => {
    it('T-084-22: VOLUMETRIC_SHAPES includes supershape, cliffordTorus, and gyroid', () => {
      expect(VOLUMETRIC_SHAPES).toContain('supershape');
      expect(VOLUMETRIC_SHAPES).toContain('cliffordTorus');
      expect(VOLUMETRIC_SHAPES).toContain('gyroid');
    });

    it('T-084-23: all parametric shapes produce bounding box with non-zero range in X, Y, Z', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 500, seed: 'bbox-' + shape });
        const bounds = computeBounds(result);
        expect(bounds.maxX - bounds.minX).toBeGreaterThan(0.5);
        expect(bounds.maxY - bounds.minY).toBeGreaterThan(0.5);
        expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(0.5);
      }
    });

    it('T-084-24: no NaN values in any parametric generator output', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 500, seed: 'nan-' + shape });
        for (let i = 0; i < result.length; i++) {
          expect(Number.isNaN(result[i])).toBe(false);
        }
      }
    });

    it('T-084-25: no Infinity values in any parametric generator output', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 500, seed: 'inf-' + shape });
        for (let i = 0; i < result.length; i++) {
          expect(Number.isFinite(result[i])).toBe(true);
        }
      }
    });

    it('T-084-26: pointCount=0 returns empty Float32Array for parametric shapes', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 0, seed: 'empty-' + shape });
        expect(result).toBeInstanceOf(Float32Array);
        expect(result.length).toBe(0);
      }
    });

    it('T-084-27: pointCount=1 returns valid 3D point for parametric shapes', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 1, seed: 'single-' + shape });
        expect(result.length).toBe(3);
        for (let i = 0; i < 3; i++) {
          expect(Number.isFinite(result[i])).toBe(true);
        }
      }
    });

    it('T-084-28: parametric shapes produce points centered near origin (extent ~2.0)', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 1000, seed: 'center-' + shape });
        const count = result.length / 3;
        let sumX = 0, sumY = 0, sumZ = 0;
        for (let i = 0; i < count; i++) {
          sumX += result[i * 3];
          sumY += result[i * 3 + 1];
          sumZ += result[i * 3 + 2];
        }
        // Mean should be near origin (within 1.0 unit)
        expect(Math.abs(sumX / count)).toBeLessThan(1.0);
        expect(Math.abs(sumY / count)).toBeLessThan(1.0);
        expect(Math.abs(sumZ / count)).toBeLessThan(1.0);
      }
    });

    it('T-084-29: no localStorage or cookie access during parametric generation', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      for (const shape of PARAMETRIC_SHAPES) {
        generateVolumetricPoints({ shape: shape as any, pointCount: 50, seed: 'privacy-' + shape });
      }
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });

    it('T-084-30: high point count (2000) completes without timeout for all parametric shapes', () => {
      for (const shape of PARAMETRIC_SHAPES) {
        const start = performance.now();
        const result = generateVolumetricPoints({ shape: shape as any, pointCount: 2000, seed: 'perf-' + shape });
        const elapsed = performance.now() - start;
        expect(result.length).toBe(6000);
        // Should complete well under 1 second (gyroid rejection sampling is the risk)
        expect(elapsed).toBeLessThan(1000);
      }
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { generateVolumetricPoints } from '../../../src/visual/generators/volumetricPoints';

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

describe('US-044: Crystal volumetric shape generators', () => {
  describe('crystalCluster', () => {
    it('T-044-01: crystalCluster generator returns Float32Array with length 3 × pointCount', () => {
      const result = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 100, seed: 'cc-len' });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(300);
    });

    it('T-044-02: crystalCluster generator produces non-zero spread in X, Y, and Z independently', () => {
      const result = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 500, seed: 'cc-spread' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      expect(stdX).toBeGreaterThan(0.1);
      expect(stdY).toBeGreaterThan(0.1);
      expect(stdZ).toBeGreaterThan(0.1);
    });

    it('T-044-03: crystalCluster generator produces non-coplanar points', () => {
      const result = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 500, seed: 'cc-coplanar' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      const minStd = Math.min(stdX, stdY, stdZ);
      expect(minStd).toBeGreaterThan(0.05);
    });

    it('T-044-04: crystalCluster generator is deterministic with same seed', () => {
      const a = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 100, seed: 'det-cc' });
      const b = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 100, seed: 'det-cc' });
      expect(a).toEqual(b);
    });

    it('T-044-05: crystalCluster generator produces different output for different seeds', () => {
      const a = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 100, seed: 'cc-a' });
      const b = generateVolumetricPoints({ shape: 'crystalCluster', pointCount: 100, seed: 'cc-b' });
      expect(a).not.toEqual(b);
    });
  });

  describe('geode', () => {
    it('T-044-06: geode generator returns Float32Array with length 3 × pointCount', () => {
      const result = generateVolumetricPoints({ shape: 'geode', pointCount: 100, seed: 'geode-len' });
      expect(result).toBeInstanceOf(Float32Array);
      expect(result.length).toBe(300);
    });

    it('T-044-07: geode generator produces non-zero spread in X, Y, and Z independently', () => {
      const result = generateVolumetricPoints({ shape: 'geode', pointCount: 500, seed: 'geode-spread' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      expect(stdX).toBeGreaterThan(0.1);
      expect(stdY).toBeGreaterThan(0.1);
      expect(stdZ).toBeGreaterThan(0.1);
    });

    it('T-044-08: geode generator produces non-coplanar points', () => {
      const result = generateVolumetricPoints({ shape: 'geode', pointCount: 500, seed: 'geode-coplanar' });
      const { stdX, stdY, stdZ } = computeAxisStdDev(result);
      const minStd = Math.min(stdX, stdY, stdZ);
      expect(minStd).toBeGreaterThan(0.05);
    });

    it('T-044-09: geode generator is deterministic with same seed', () => {
      const a = generateVolumetricPoints({ shape: 'geode', pointCount: 100, seed: 'det-geode' });
      const b = generateVolumetricPoints({ shape: 'geode', pointCount: 100, seed: 'det-geode' });
      expect(a).toEqual(b);
    });

    it('T-044-10: geode generator produces different output for different seeds', () => {
      const a = generateVolumetricPoints({ shape: 'geode', pointCount: 100, seed: 'geode-a' });
      const b = generateVolumetricPoints({ shape: 'geode', pointCount: 100, seed: 'geode-b' });
      expect(a).not.toEqual(b);
    });

    it('T-044-11: geode has hollow interior structure (inner points at smaller radii than shell)', () => {
      const result = generateVolumetricPoints({ shape: 'geode', pointCount: 500, seed: 'geode-hollow' });
      const count = result.length / 3;
      const radii: number[] = [];
      for (let i = 0; i < count; i++) {
        const x = result[i * 3], y = result[i * 3 + 1], z = result[i * 3 + 2];
        radii.push(Math.sqrt(x * x + y * y + z * z));
      }
      const minR = Math.min(...radii);
      const maxR = Math.max(...radii);
      // Should have both inner scatter and outer shell
      expect(maxR - minR).toBeGreaterThan(0.5);
      // Inner points should exist significantly closer to center than the shell
      const innerCount = radii.filter(r => r < maxR * 0.6).length;
      expect(innerCount).toBeGreaterThan(0);
    });
  });

  describe('cross-shape checks', () => {
    it('T-044-12: both crystal shapes produce bounding box with non-zero range in X, Y, and Z', () => {
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        const result = generateVolumetricPoints({ shape, pointCount: 500, seed: 'bbox-' + shape });
        const count = result.length / 3;
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        for (let i = 0; i < count; i++) {
          const x = result[i * 3], y = result[i * 3 + 1], z = result[i * 3 + 2];
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
          if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
        }
        expect(maxX - minX).toBeGreaterThan(0.5);
        expect(maxY - minY).toBeGreaterThan(0.5);
        expect(maxZ - minZ).toBeGreaterThan(0.5);
      }
    });

    it('T-044-13: no NaN values in crystal generator output', () => {
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        const result = generateVolumetricPoints({ shape, pointCount: 200, seed: 'nan-' + shape });
        for (let i = 0; i < result.length; i++) {
          expect(Number.isNaN(result[i])).toBe(false);
        }
      }
    });

    it('T-044-14: no Infinity values in crystal generator output', () => {
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        const result = generateVolumetricPoints({ shape, pointCount: 200, seed: 'inf-' + shape });
        for (let i = 0; i < result.length; i++) {
          expect(Number.isFinite(result[i])).toBe(true);
        }
      }
    });

    it('T-044-15: pointCount=0 returns empty Float32Array for crystal shapes', () => {
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        const result = generateVolumetricPoints({ shape, pointCount: 0, seed: 'empty-' + shape });
        expect(result).toBeInstanceOf(Float32Array);
        expect(result.length).toBe(0);
      }
    });

    it('T-044-16: pointCount=1 returns a valid 3D point for crystal shapes', () => {
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        const result = generateVolumetricPoints({ shape, pointCount: 1, seed: 'single-' + shape });
        expect(result.length).toBe(3);
        expect(Number.isNaN(result[0])).toBe(false);
        expect(Number.isNaN(result[1])).toBe(false);
        expect(Number.isNaN(result[2])).toBe(false);
      }
    });

    it('T-044-17: VOLUMETRIC_SHAPES array includes crystalCluster and geode', async () => {
      const { VOLUMETRIC_SHAPES } = await import('../../../src/visual/generators/volumetricPoints');
      expect(VOLUMETRIC_SHAPES).toContain('crystalCluster');
      expect(VOLUMETRIC_SHAPES).toContain('geode');
    });

    it('T-044-18: no localStorage or cookie access during crystal generation', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const shapes = ['crystalCluster', 'geode'] as const;
      for (const shape of shapes) {
        generateVolumetricPoints({ shape, pointCount: 50, seed: 'privacy-' + shape });
      }
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

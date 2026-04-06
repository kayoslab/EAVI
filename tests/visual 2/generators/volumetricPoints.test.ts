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

describe('US-040: Volumetric point cloud generators', () => {
  it('T-040-01: sphereVolume generator returns Float32Array with length 3 × pointCount', () => {
    const result = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 100, seed: 'sphere-len' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(300);
  });

  it('T-040-02: sphereVolume generator produces non-zero spread in X, Y, and Z independently', () => {
    const result = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 500, seed: 'sphere-spread' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    expect(stdX).toBeGreaterThan(0.1);
    expect(stdY).toBeGreaterThan(0.1);
    expect(stdZ).toBeGreaterThan(0.1);
  });

  it('T-040-03: sphereVolume generator produces non-coplanar points', () => {
    const result = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 500, seed: 'sphere-coplanar' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    const minStd = Math.min(stdX, stdY, stdZ);
    expect(minStd).toBeGreaterThan(0.05);
  });

  it('T-040-04: sphereVolume generator is deterministic with same seed', () => {
    const a = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 100, seed: 'det-sphere' });
    const b = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 100, seed: 'det-sphere' });
    expect(a).toEqual(b);
  });

  it('T-040-05: sphereVolume generator produces different output for different seeds', () => {
    const a = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 100, seed: 'sphere-a' });
    const b = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 100, seed: 'sphere-b' });
    expect(a).not.toEqual(b);
  });

  it('T-040-06: shell generator returns Float32Array with length 3 × pointCount', () => {
    const result = generateVolumetricPoints({ shape: 'shell', pointCount: 100, seed: 'shell-len' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(300);
  });

  it('T-040-07: shell generator produces non-zero spread in X, Y, and Z independently', () => {
    const result = generateVolumetricPoints({ shape: 'shell', pointCount: 500, seed: 'shell-spread' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    expect(stdX).toBeGreaterThan(0.1);
    expect(stdY).toBeGreaterThan(0.1);
    expect(stdZ).toBeGreaterThan(0.1);
  });

  it('T-040-08: shell generator produces non-coplanar points', () => {
    const result = generateVolumetricPoints({ shape: 'shell', pointCount: 500, seed: 'shell-coplanar' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    const minStd = Math.min(stdX, stdY, stdZ);
    expect(minStd).toBeGreaterThan(0.05);
  });

  it('T-040-09: shell generator is deterministic with same seed', () => {
    const a = generateVolumetricPoints({ shape: 'shell', pointCount: 100, seed: 'det-shell' });
    const b = generateVolumetricPoints({ shape: 'shell', pointCount: 100, seed: 'det-shell' });
    expect(a).toEqual(b);
  });

  it('T-040-10: shell generator produces different output for different seeds', () => {
    const a = generateVolumetricPoints({ shape: 'shell', pointCount: 100, seed: 'shell-a' });
    const b = generateVolumetricPoints({ shape: 'shell', pointCount: 100, seed: 'shell-b' });
    expect(a).not.toEqual(b);
  });

  it('T-040-11: torusVolume generator returns Float32Array with length 3 × pointCount', () => {
    const result = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 100, seed: 'torus-len' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(300);
  });

  it('T-040-12: torusVolume generator produces non-zero spread in X, Y, and Z independently', () => {
    const result = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 500, seed: 'torus-spread' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    expect(stdX).toBeGreaterThan(0.1);
    expect(stdY).toBeGreaterThan(0.1);
    expect(stdZ).toBeGreaterThan(0.1);
  });

  it('T-040-13: torusVolume generator produces non-coplanar points', () => {
    const result = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 500, seed: 'torus-coplanar' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    const minStd = Math.min(stdX, stdY, stdZ);
    expect(minStd).toBeGreaterThan(0.05);
  });

  it('T-040-14: torusVolume generator is deterministic with same seed', () => {
    const a = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 100, seed: 'det-torus' });
    const b = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 100, seed: 'det-torus' });
    expect(a).toEqual(b);
  });

  it('T-040-15: torusVolume generator produces different output for different seeds', () => {
    const a = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 100, seed: 'torus-a' });
    const b = generateVolumetricPoints({ shape: 'torusVolume', pointCount: 100, seed: 'torus-b' });
    expect(a).not.toEqual(b);
  });

  it('T-040-16: noiseLattice generator returns Float32Array with length 3 × pointCount', () => {
    const result = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 100, seed: 'lattice-len' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(300);
  });

  it('T-040-17: noiseLattice generator produces non-zero spread in X, Y, and Z independently', () => {
    const result = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 500, seed: 'lattice-spread' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    expect(stdX).toBeGreaterThan(0.1);
    expect(stdY).toBeGreaterThan(0.1);
    expect(stdZ).toBeGreaterThan(0.1);
  });

  it('T-040-18: noiseLattice generator produces non-coplanar points', () => {
    const result = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 500, seed: 'lattice-coplanar' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    const minStd = Math.min(stdX, stdY, stdZ);
    expect(minStd).toBeGreaterThan(0.05);
  });

  it('T-040-19: noiseLattice generator is deterministic with same seed', () => {
    const a = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 100, seed: 'det-lattice' });
    const b = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 100, seed: 'det-lattice' });
    expect(a).toEqual(b);
  });

  it('T-040-20: noiseLattice generator produces different output for different seeds', () => {
    const a = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 100, seed: 'lattice-a' });
    const b = generateVolumetricPoints({ shape: 'noiseLattice', pointCount: 100, seed: 'lattice-b' });
    expect(a).not.toEqual(b);
  });

  it('T-040-21: spiralField generator returns Float32Array with length 3 × pointCount', () => {
    const result = generateVolumetricPoints({ shape: 'spiralField', pointCount: 100, seed: 'spiral-len' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(300);
  });

  it('T-040-22: spiralField generator produces non-zero spread in X, Y, and Z independently', () => {
    const result = generateVolumetricPoints({ shape: 'spiralField', pointCount: 500, seed: 'spiral-spread' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    expect(stdX).toBeGreaterThan(0.1);
    expect(stdY).toBeGreaterThan(0.1);
    expect(stdZ).toBeGreaterThan(0.1);
  });

  it('T-040-23: spiralField generator produces non-coplanar points', () => {
    const result = generateVolumetricPoints({ shape: 'spiralField', pointCount: 500, seed: 'spiral-coplanar' });
    const { stdX, stdY, stdZ } = computeAxisStdDev(result);
    const minStd = Math.min(stdX, stdY, stdZ);
    expect(minStd).toBeGreaterThan(0.05);
  });

  it('T-040-24: spiralField generator is deterministic with same seed', () => {
    const a = generateVolumetricPoints({ shape: 'spiralField', pointCount: 100, seed: 'det-spiral' });
    const b = generateVolumetricPoints({ shape: 'spiralField', pointCount: 100, seed: 'det-spiral' });
    expect(a).toEqual(b);
  });

  it('T-040-25: spiralField generator produces different output for different seeds', () => {
    const a = generateVolumetricPoints({ shape: 'spiralField', pointCount: 100, seed: 'spiral-a' });
    const b = generateVolumetricPoints({ shape: 'spiralField', pointCount: 100, seed: 'spiral-b' });
    expect(a).not.toEqual(b);
  });

  it('T-040-26: pointCount=0 returns empty Float32Array', () => {
    const result = generateVolumetricPoints({ shape: 'sphereVolume', pointCount: 0, seed: 'empty' });
    expect(result).toBeInstanceOf(Float32Array);
    expect(result.length).toBe(0);
  });

  it('T-040-27: pointCount=1 returns a valid 3D point (length 3, no NaN)', () => {
    const shapes = ['sphereVolume', 'shell', 'torusVolume', 'noiseLattice', 'spiralField'] as const;
    for (const shape of shapes) {
      const result = generateVolumetricPoints({ shape, pointCount: 1, seed: 'single-' + shape });
      expect(result.length).toBe(3);
      expect(Number.isNaN(result[0])).toBe(false);
      expect(Number.isNaN(result[1])).toBe(false);
      expect(Number.isNaN(result[2])).toBe(false);
    }
  });

  it('T-040-28: all generators produce bounding box with non-zero range in X, Y, and Z', () => {
    const shapes = ['sphereVolume', 'shell', 'torusVolume', 'noiseLattice', 'spiralField'] as const;
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

  it('T-040-29: no NaN values in any generator output', () => {
    const shapes = ['sphereVolume', 'shell', 'torusVolume', 'noiseLattice', 'spiralField'] as const;
    for (const shape of shapes) {
      const result = generateVolumetricPoints({ shape, pointCount: 200, seed: 'nan-' + shape });
      for (let i = 0; i < result.length; i++) {
        expect(Number.isNaN(result[i])).toBe(false);
      }
    }
  });

  it('T-040-30: no Infinity values in any generator output', () => {
    const shapes = ['sphereVolume', 'shell', 'torusVolume', 'noiseLattice', 'spiralField'] as const;
    for (const shape of shapes) {
      const result = generateVolumetricPoints({ shape, pointCount: 200, seed: 'inf-' + shape });
      for (let i = 0; i < result.length; i++) {
        expect(Number.isFinite(result[i])).toBe(true);
      }
    }
  });

  it('T-040-31: no localStorage or cookie access during generation', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const shapes = ['sphereVolume', 'shell', 'torusVolume', 'noiseLattice', 'spiralField'] as const;
    for (const shape of shapes) {
      generateVolumetricPoints({ shape, pointCount: 50, seed: 'privacy-' + shape });
    }
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createPointCloud,
  getPointCount,
  getPointPositions,
} from '../../../src/visual/systems/pointCloud';
import type { VisualParams } from '../../../src/visual/mappings';

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.5,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

function makeFrame(overrides: Partial<{ time: number; delta: number; elapsed: number; params: VisualParams; width: number; height: number; pointerX: number; pointerY: number }> = {}) {
  return {
    time: 0,
    delta: 16,
    elapsed: 0,
    params: defaultParams,
    width: 800,
    height: 600,
    ...overrides,
  };
}

describe('US-031: PointCloud geometry system', () => {
  it('T-031-01: init() adds a THREE.Points mesh to the scene', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'points-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-031-02: Points mesh uses BufferGeometry with position attribute (itemSize 3)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ maxPoints: 500 });
    cloud.init(scene, 'buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThanOrEqual(getPointCount(cloud));
  });

  it('T-031-03: point positions have non-zero Z-depth: Z values span a range > 1.0', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'depth-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = getPointCount(cloud);
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-031-04: cloud is not coplanar with XY plane (not all Z values are zero)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'coplanar-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = getPointCount(cloud);
    let hasNonZeroZ = false;
    for (let i = 0; i < count; i++) {
      if (posArr[i * 3 + 2] !== 0) {
        hasNonZeroZ = true;
        break;
      }
    }
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-031-05: mesh rotation changes over elapsed time (camera drift / parallax)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'drift-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    cloud.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    cloud.draw(scene, makeFrame({ elapsed: 5000 }));
    const rotY1 = points.rotation.y;
    expect(rotY1).not.toBeCloseTo(rotY0, 5);
  });

  it('T-031-06: maxPoints=200 produces fewer points than maxPoints=1200', () => {
    const scene = new THREE.Scene();
    const cloudLow = createPointCloud({ maxPoints: 200 });
    cloudLow.init(scene, 'tier-seed', defaultParams);
    const lowCount = getPointCount(cloudLow);

    const cloudHigh = createPointCloud({ maxPoints: 1200 });
    cloudHigh.init(scene, 'tier-seed', defaultParams);
    const highCount = getPointCount(cloudHigh);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-031-07: point count never exceeds the configured maxPoints', () => {
    const scene = new THREE.Scene();
    const maxPoints = 300;
    const cloud = createPointCloud({ maxPoints });
    cloud.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getPointCount(cloud)).toBeLessThanOrEqual(maxPoints);
  });

  it('T-031-08: same seed produces identical initial positions (deterministic)', () => {
    const scene = new THREE.Scene();
    const a = createPointCloud();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createPointCloud();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getPointPositions(a)).toEqual(getPointPositions(b));
  });

  it('T-031-09: different seeds produce different initial positions', () => {
    const scene = new THREE.Scene();
    const a = createPointCloud();
    a.init(scene, 'seed-one', defaultParams);
    const b = createPointCloud();
    b.init(scene, 'seed-two', defaultParams);
    expect(getPointPositions(a)).not.toEqual(getPointPositions(b));
  });

  it('T-031-10: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'safe-seed', defaultParams);
    expect(() => cloud.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-031-11: draw() updates shader uniforms (GPU-side deformation)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'update-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(mat.uniforms.uTime.value).toBe(100);
  });

  it('T-031-12: cleanup() removes mesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    cloud.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-031-13: bass energy influences point cloud motion (uBassEnergy uniform differs)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'bass-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-031-14: treble energy influences point jitter (uTrebleEnergy uniform differs)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'treble-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-031-15: colors derive from paletteHue (uPaletteHue uniform reflects param)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 180 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(180);
  });

  it('T-031-16: has aVertexColor buffer attribute and ShaderMaterial with vertex/fragment shaders', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'color-buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const colorAttr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor');
    expect(colorAttr).toBeDefined();
    expect(colorAttr.itemSize).toBe(3);
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
  });

  describe('US-040: PointCloud generator integration', () => {
    it('T-040-32: init() produces volumetric geometry with Z-depth > 1.0 after generator integration', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'vol-depth', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      const count = getPointCount(cloud);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < count; i++) {
        const z = posArr[i * 3 + 2];
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      expect(maxZ - minZ).toBeGreaterThan(1.0);
    });

    it('T-040-33: init() produces non-coplanar points after generator integration', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'vol-coplanar', defaultParams);
      const positions = getPointPositions(cloud)!;
      const count = positions.length / 3;
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
      expect(Math.sqrt(varX / count)).toBeGreaterThan(0.1);
      expect(Math.sqrt(varY / count)).toBeGreaterThan(0.1);
      expect(Math.sqrt(varZ / count)).toBeGreaterThan(0.1);
    });

    it('T-040-34: different seeds can produce different generator shapes', () => {
      const scene = new THREE.Scene();
      const seeds = ['shape-a', 'shape-b', 'shape-c', 'shape-d', 'shape-e'];
      const positionSets = seeds.map(seed => {
        const cloud = createPointCloud();
        cloud.init(scene, seed, defaultParams);
        return getPointPositions(cloud);
      });
      let hasDifference = false;
      for (let i = 1; i < positionSets.length; i++) {
        if (positionSets[i]!.length !== positionSets[0]!.length || !positionSets[i]!.every((v, j) => v === positionSets[0]![j])) {
          hasDifference = true;
          break;
        }
      }
      expect(hasDifference).toBe(true);
    });

    it('T-040-35: determinism preserved after generator integration', () => {
      const scene = new THREE.Scene();
      const a = createPointCloud();
      a.init(scene, 'gen-det', defaultParams);
      const b = createPointCloud();
      b.init(scene, 'gen-det', defaultParams);
      expect(getPointPositions(a)).toEqual(getPointPositions(b));
    });
  });

  describe('privacy', () => {
    it('T-031-17: no localStorage or cookie access during init/draw operations', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'privacy-seed', defaultParams);
      cloud.draw(scene, makeFrame());
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  it('T-031-18: density parameter scales effective point count (higher density = more points)', () => {
    const scene = new THREE.Scene();
    const cloudLow = createPointCloud();
    cloudLow.init(scene, 'density-seed', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(cloudLow);

    const cloudHigh = createPointCloud();
    cloudHigh.init(scene, 'density-seed', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(cloudHigh);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-031-19: low motionAmplitude produces smaller uMotionAmplitude uniform than high', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'motion-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    cloud.draw(scene, makeFrame({ elapsed: 100, params: lowParams }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    cloud.draw(scene, makeFrame({ elapsed: 100, params: highParams }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  it('T-031-20: boundary values (density=0, density=1, structureComplexity=0, structureComplexity=1) do not throw', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
      { density: 0.5, structureComplexity: 0.5 },
    ];
    for (const b of boundaries) {
      const cloud = createPointCloud();
      const params = { ...defaultParams, ...b };
      expect(() => {
        cloud.init(scene, 'boundary-seed', params);
        cloud.draw(scene, makeFrame({ params }));
      }).not.toThrow();
    }
  });
});

describe('US-050: PointCloud geometry attribute validation', () => {
  it('T-050-14: init() succeeds with valid seed and params (geometry passes validation)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    expect(() => cloud.init(scene, 'valid-seed', defaultParams)).not.toThrow();
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-050-15: geometry has all required attributes after init: position(3), size(1), aRandom(3), aVertexColor(3)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
    expect(geo.getAttribute('aVertexColor').itemSize).toBe(3);
    expect(geo.getAttribute('size')).toBeDefined();
    expect(geo.getAttribute('size').itemSize).toBe(1);
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aRandom').itemSize).toBe(3);
  });

  it('T-050-16: position buffer contains only finite values after init (no NaN or Infinity)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    for (let i = 0; i < posArr.length; i++) {
      expect(Number.isFinite(posArr[i])).toBe(true);
    }
  });

  it('T-050-17: all buffer attributes contain only finite values after init', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'all-finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    for (const name of ['aVertexColor', 'size', 'aRandom']) {
      const arr = geo.getAttribute(name).array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });

  it('T-050-18: position buffer values are finite at boundary params', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0 },
      { density: 1, structureComplexity: 1 },
    ];
    for (const b of boundaries) {
      const cloud = createPointCloud();
      cloud.init(scene, 'boundary-finite-seed', { ...defaultParams, ...b });
      const points = scene.children.filter((c) => c instanceof THREE.Points).pop() as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      for (let i = 0; i < posArr.length; i++) {
        expect(Number.isFinite(posArr[i])).toBe(true);
      }
    }
  });
});

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

  it('T-031-11: draw() flags position buffer needsUpdate (version increments)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'update-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posAttr = (points.geometry as THREE.BufferGeometry).getAttribute('position') as THREE.BufferAttribute;
    const versionBefore = posAttr.version;
    cloud.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(posAttr.version).toBeGreaterThan(versionBefore);
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

  it('T-031-13: bass energy influences point cloud motion (positions differ with bass=0 vs bass=1)', () => {
    const scene1 = new THREE.Scene();
    const cloud1 = createPointCloud();
    const noBassParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    cloud1.init(scene1, 'bass-seed', noBassParams);
    cloud1.draw(scene1, makeFrame({ time: 100, elapsed: 100, params: noBassParams }));
    const pos1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const cloud2 = createPointCloud();
    const highBassParams = { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 0, pointerDisturbance: 0 };
    cloud2.init(scene2, 'bass-seed', highBassParams);
    cloud2.draw(scene2, makeFrame({ time: 100, elapsed: 100, params: highBassParams }));
    const pos2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
  });

  it('T-031-14: treble energy influences point jitter', () => {
    const scene1 = new THREE.Scene();
    const cloud1 = createPointCloud();
    const lowTrebleParams = { ...defaultParams, trebleEnergy: 0 };
    cloud1.init(scene1, 'treble-seed', lowTrebleParams);
    cloud1.draw(scene1, makeFrame({ time: 100, elapsed: 100, params: lowTrebleParams }));
    const pos1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const cloud2 = createPointCloud();
    const highTrebleParams = { ...defaultParams, trebleEnergy: 1.0 };
    cloud2.init(scene2, 'treble-seed', highTrebleParams);
    cloud2.draw(scene2, makeFrame({ time: 100, elapsed: 100, params: highTrebleParams }));
    const pos2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
  });

  it('T-031-15: colors derive from paletteHue (different hue produces different color buffer)', () => {
    const scene1 = new THREE.Scene();
    const cloud1 = createPointCloud();
    cloud1.init(scene1, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    cloud1.draw(scene1, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    const col1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('color').array as Float32Array);

    const scene2 = new THREE.Scene();
    const cloud2 = createPointCloud();
    cloud2.init(scene2, 'hue-seed', { ...defaultParams, paletteHue: 180 });
    cloud2.draw(scene2, makeFrame({ params: { ...defaultParams, paletteHue: 180 } }));
    const col2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('color').array as Float32Array);

    expect(col1).not.toEqual(col2);
  });

  it('T-031-16: has color buffer attribute with vertexColors enabled on material', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'color-buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const colorAttr = (points.geometry as THREE.BufferGeometry).getAttribute('color');
    expect(colorAttr).toBeDefined();
    expect(colorAttr.itemSize).toBe(3);
    const mat = points.material as THREE.PointsMaterial;
    expect(mat.vertexColors).toBe(true);
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

  it('T-031-19: low motionAmplitude produces less displacement than high motionAmplitude', () => {
    const scene1 = new THREE.Scene();
    const cloudLow = createPointCloud();
    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    cloudLow.init(scene1, 'motion-seed', lowParams);
    const lowPoints = scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lowGeo = lowPoints.geometry as THREE.BufferGeometry;
    const lowInitial = Float32Array.from(lowGeo.getAttribute('position').array as Float32Array);
    cloudLow.draw(scene1, makeFrame({ elapsed: 100, params: lowParams }));
    const lowAfter = Float32Array.from(lowGeo.getAttribute('position').array as Float32Array);
    let lowDisp = 0;
    for (let i = 0; i < lowInitial.length; i++) lowDisp += Math.abs(lowAfter[i] - lowInitial[i]);

    const scene2 = new THREE.Scene();
    const cloudHigh = createPointCloud();
    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    cloudHigh.init(scene2, 'motion-seed', highParams);
    const highPoints = scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const highGeo = highPoints.geometry as THREE.BufferGeometry;
    const highInitial = Float32Array.from(highGeo.getAttribute('position').array as Float32Array);
    cloudHigh.draw(scene2, makeFrame({ elapsed: 100, params: highParams }));
    const highAfter = Float32Array.from(highGeo.getAttribute('position').array as Float32Array);
    let highDisp = 0;
    for (let i = 0; i < highInitial.length; i++) highDisp += Math.abs(highAfter[i] - highInitial[i]);

    expect(highDisp).toBeGreaterThan(lowDisp);
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

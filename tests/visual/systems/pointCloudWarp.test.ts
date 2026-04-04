import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createPointCloud,
  getPointCount,
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

function makeFrame(overrides: Partial<{
  time: number; delta: number; elapsed: number;
  params: VisualParams; width: number; height: number;
  pointerX: number; pointerY: number;
}> = {}) {
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

function getMaterial(scene: THREE.Scene): THREE.ShaderMaterial {
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return points.material as THREE.ShaderMaterial;
}

function getGeometry(scene: THREE.Scene): THREE.BufferGeometry {
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return points.geometry as THREE.BufferGeometry;
}

describe('US-032: Audio-driven 3D warp shader for point cloud', () => {
  it('T-032-01: ShaderMaterial is created with correct uniforms', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'shader-seed', defaultParams);
    const mat = getMaterial(scene);
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    const expectedUniforms = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uMotionAmplitude',
      'uPointerDisturbance', 'uPointerPos', 'uPaletteHue',
      'uPaletteSaturation', 'uBreathScale', 'uCadence', 'uBasePointSize',
    ];
    for (const name of expectedUniforms) {
      expect(mat.uniforms[name], `missing uniform: ${name}`).toBeDefined();
    }
  });

  it('T-032-02: aRandom attribute is present with 3 components per point', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'arandom-seed', defaultParams);
    const geo = getGeometry(scene);
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
    expect(aRandom.count).toBe(getPointCount(cloud));
  });

  it('T-032-03: aHueOffset attribute is present with 1 component per point', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'hueoffset-seed', defaultParams);
    const geo = getGeometry(scene);
    const aHueOffset = geo.getAttribute('aHueOffset');
    expect(aHueOffset).toBeDefined();
    expect(aHueOffset.itemSize).toBe(1);
    expect(aHueOffset.count).toBe(getPointCount(cloud));
  });

  it('T-032-04: Uniforms update correctly when draw() is called with varying bassEnergy values', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'bass-uniform-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.8 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
  });

  it('T-032-05: Uniforms update correctly when draw() is called with varying trebleEnergy values', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'treble-uniform-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.9 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.9);
  });

  it('T-032-06: uTime uniform advances with elapsed time (not stuck at 0)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'time-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ elapsed: 0 }));
    const t0 = mat.uniforms.uTime.value;

    cloud.draw(scene, makeFrame({ elapsed: 5000 }));
    const t1 = mat.uniforms.uTime.value;

    expect(t1).toBeGreaterThan(t0);
  });

  it('T-032-07: Mesh-level rotation still responds to bassEnergy (macro rotation offset)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'rot-bass-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;

    cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0 } }));
    const rotNoBass = points.rotation.y;

    cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 1.0 } }));
    const rotHighBass = points.rotation.y;

    expect(rotHighBass).not.toBeCloseTo(rotNoBass, 5);
  });

  it('T-032-08: Mesh-level Z breathing still works with motionAmplitude', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'zbreathe-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;

    cloud.draw(scene, makeFrame({ elapsed: 0 }));
    const z0 = points.position.z;

    cloud.draw(scene, makeFrame({ elapsed: 5000 }));
    const z1 = points.position.z;

    expect(z1).not.toBeCloseTo(z0, 5);
  });

  it('T-032-09: Pointer disturbance uniform updates from frame pointer position', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'ptr-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({
      pointerX: 0.3,
      pointerY: 0.7,
      params: { ...defaultParams, pointerDisturbance: 0.8 },
    }));

    expect(mat.uniforms.uPointerDisturbance.value).toBe(0.8);
    const pos = mat.uniforms.uPointerPos.value;
    expect(pos.x).toBeCloseTo(0.3 - 0.5, 5);
    expect(pos.y).toBeCloseTo(0.7 - 0.5, 5);
  });

  it('T-032-10: Warp continues when bassEnergy and trebleEnergy are both 0 (uTime still advances)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    const silentParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0 };
    cloud.init(scene, 'silent-seed', silentParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ elapsed: 0, params: silentParams }));
    const t0 = mat.uniforms.uTime.value;

    cloud.draw(scene, makeFrame({ elapsed: 10000, params: silentParams }));
    const t1 = mat.uniforms.uTime.value;

    expect(t1).toBeGreaterThan(t0);
  });

  it('T-032-11: No CPU-side position buffer writes occur in draw() (posAttr.needsUpdate is NOT set)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'no-cpu-seed', defaultParams);
    const geo = getGeometry(scene);
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;

    // Reset version tracking
    const versionBefore = posAttr.version;
    cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, bassEnergy: 0.5 } }));

    // Position buffer should NOT be updated on CPU — GPU handles deformation
    expect(posAttr.version).toBe(versionBefore);
  });

  it('T-032-12: ShaderMaterial uses AdditiveBlending and depthWrite: false', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'blend-seed', defaultParams);
    const mat = getMaterial(scene);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-032-13: Cleanup disposes ShaderMaterial and geometry correctly', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    cloud.cleanup();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-032-14: Reduced motion (motionAmplitude < 1) scales uMotionAmplitude uniform', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    const reducedParams = { ...defaultParams, motionAmplitude: 0.2 };
    cloud.init(scene, 'reduced-seed', reducedParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ params: reducedParams }));
    expect(mat.uniforms.uMotionAmplitude.value).toBe(0.2);
  });

  it('T-032-15: Point count respects quality tier maxPoints', () => {
    const scene = new THREE.Scene();
    const maxPoints = 300;
    const cloud = createPointCloud({ maxPoints });
    cloud.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getPointCount(cloud)).toBeLessThanOrEqual(maxPoints);
  });

  it('T-032-16: Deterministic — same seed produces same aRandom values', () => {
    const scene1 = new THREE.Scene();
    const cloud1 = createPointCloud();
    cloud1.init(scene1, 'det-seed', defaultParams);
    const aRandom1 = Float32Array.from(
      getGeometry(scene1).getAttribute('aRandom').array as Float32Array,
    );

    const scene2 = new THREE.Scene();
    const cloud2 = createPointCloud();
    cloud2.init(scene2, 'det-seed', defaultParams);
    const aRandom2 = Float32Array.from(
      getGeometry(scene2).getAttribute('aRandom').array as Float32Array,
    );

    expect(aRandom1).toEqual(aRandom2);
  });

  it('T-032-17: vertexShader and fragmentShader strings are non-empty on the material', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'shader-str-seed', defaultParams);
    const mat = getMaterial(scene);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-032-18: uBreathScale uniform changes over time (not constant)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'breath-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ elapsed: 0 }));
    const b0 = mat.uniforms.uBreathScale.value;

    cloud.draw(scene, makeFrame({ elapsed: 5000 }));
    const b1 = mat.uniforms.uBreathScale.value;

    expect(b1).not.toBeCloseTo(b0, 5);
  });

  it('T-032-19: uCadence uniform reflects cadence param from VisualParams', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'cadence-seed', defaultParams);
    const mat = getMaterial(scene);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, cadence: 0.4 } }));
    expect(mat.uniforms.uCadence.value).toBe(0.4);

    cloud.draw(scene, makeFrame({ params: { ...defaultParams, cadence: 1.0 } }));
    expect(mat.uniforms.uCadence.value).toBe(1.0);
  });

  describe('privacy', () => {
    it('T-032-20: No localStorage, sessionStorage, or cookie access during init or draw', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const ssSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'privacy-seed', defaultParams);
      cloud.draw(scene, makeFrame());
      expect(lsSpy).not.toHaveBeenCalled();
      expect(ssSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

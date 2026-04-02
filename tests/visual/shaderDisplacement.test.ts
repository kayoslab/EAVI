import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createPointCloud, getPointCount } from '../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../src/visual/systems/ribbonField';
import type { VisualParams } from '../../src/visual/mappings';

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

function getRibbonMaterial(scene: THREE.Scene): THREE.ShaderMaterial {
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return points.material as THREE.ShaderMaterial;
}

describe('US-041: Shader-based vertex displacement', () => {
  describe('ShaderMaterial and simplex noise integration', () => {
    it('T-041-01: PointCloud ShaderMaterial includes uDisplacementScale uniform', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'disp-uniform-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uDisplacementScale, 'missing uniform: uDisplacementScale').toBeDefined();
    });

    it('T-041-02: RibbonField ShaderMaterial includes uDisplacementScale uniform', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'disp-ribbon-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uDisplacementScale, 'missing uniform: uDisplacementScale').toBeDefined();
    });

    it('T-041-03: PointCloud vertex shader contains snoise function (simplex noise included)', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'snoise-pc-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('snoise');
    });

    it('T-041-04: RibbonField vertex shader contains snoise function (simplex noise included)', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'snoise-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).toContain('snoise');
    });

    it('T-041-05: PointCloud vertex shader contains fbm3 function', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'fbm-pc-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('fbm3');
    });

    it('T-041-24: PointCloud vertex shader does not contain layeredNoise (replaced by simplex)', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'no-layered-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).not.toContain('layeredNoise');
    });

    it('T-041-25: RibbonField vertex shader does not contain layeredNoise (replaced by simplex)', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'no-layered-ribbon-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).not.toContain('layeredNoise');
    });
  });

  describe('Bass energy drives large-scale 3D displacement', () => {
    it('T-041-06: Bass energy drives uBassEnergy and uDisplacementScale > 0 when bassEnergy is high', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'bass-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 1.0, structureComplexity: 0.8 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
      expect(mat.uniforms.uDisplacementScale.value).toBeGreaterThan(0);
    });

    it('T-041-07: uDisplacementScale increases with higher motionAmplitude', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'disp-scale-seed', defaultParams);
      const mat = getMaterial(scene);

      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 0.5 } }));
      const lowDisp = mat.uniforms.uDisplacementScale.value;

      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 0.5 } }));
      const highDisp = mat.uniforms.uDisplacementScale.value;

      expect(highDisp).toBeGreaterThan(lowDisp);
    });

    it('T-041-08: uDisplacementScale increases with higher structureComplexity', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'disp-complex-seed', defaultParams);
      const mat = getMaterial(scene);

      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 0.2 } }));
      const lowDisp = mat.uniforms.uDisplacementScale.value;

      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 1.0 } }));
      const highDisp = mat.uniforms.uDisplacementScale.value;

      expect(highDisp).toBeGreaterThan(lowDisp);
    });

    it('T-041-09: Reduced motion (motionAmplitude=0.2) produces uDisplacementScale < 0.3', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'reduced-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 1.0 } }));
      expect(mat.uniforms.uDisplacementScale.value).toBeLessThan(0.3);
    });

    it('T-041-16: Vertex shader references uDisplacementScale uniform', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'disp-ref-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('uDisplacementScale');
    });

    it('T-041-17: Vertex shader references uBassEnergy for large-scale displacement', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'bass-ref-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('uBassEnergy');
    });

    it('T-041-18: RibbonField bass uniforms update correctly with bass energy', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'ribbon-bass-seed', defaultParams);
      const mat = getRibbonMaterial(scene);

      ribbon.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0.9, motionAmplitude: 1.0, structureComplexity: 0.8 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(0.9);
      expect(mat.uniforms.uDisplacementScale.value).toBeGreaterThan(0);
    });

    it('T-041-27: RibbonField uDisplacementScale scales with motionAmplitude * structureComplexity', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'ribbon-scale-seed', defaultParams);
      const mat = getRibbonMaterial(scene);

      ribbon.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 0.2 } }));
      const lowDisp = mat.uniforms.uDisplacementScale.value;

      ribbon.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 1.0 } }));
      const highDisp = mat.uniforms.uDisplacementScale.value;

      expect(highDisp).toBeGreaterThan(lowDisp);
    });
  });

  describe('Treble energy drives fine-grain displacement', () => {
    it('T-041-10: Treble energy updates uTrebleEnergy uniform when trebleEnergy is high', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'treble-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, trebleEnergy: 0.7 } }));
      expect(mat.uniforms.uTrebleEnergy.value).toBe(0.7);
      expect(mat.uniforms.uTrebleEnergy.value).toBeGreaterThan(0);
    });

    it('T-041-11: Vertex shader references uTrebleEnergy for fine-grain displacement', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'treble-shader-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('uTrebleEnergy');
    });
  });

  describe('Deformation evolves over time', () => {
    it('T-041-12: Deformation evolves over time — uTime differs at elapsed=0 vs elapsed=30000', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'time-evolve-seed', defaultParams);
      const mat = getMaterial(scene);

      cloud.draw(scene, makeFrame({ elapsed: 0 }));
      const t0 = mat.uniforms.uTime.value;

      cloud.draw(scene, makeFrame({ elapsed: 30000 }));
      const t1 = mat.uniforms.uTime.value;

      expect(t1).toBeGreaterThan(t0);
    });

    it('T-041-13: RibbonField deformation evolves over time — uTime advances with elapsed', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'ribbon-time-seed', defaultParams);
      const mat = getRibbonMaterial(scene);

      ribbon.draw(scene, makeFrame({ elapsed: 0 }));
      const t0 = mat.uniforms.uTime.value;

      ribbon.draw(scene, makeFrame({ elapsed: 30000 }));
      const t1 = mat.uniforms.uTime.value;

      expect(t1).toBeGreaterThan(t0);
    });

    it('T-041-23: uCadence modulates deformation — uniform reflects cadence param', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'cadence-disp-seed', defaultParams);
      const mat = getMaterial(scene);

      cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, cadence: 0.4 } }));
      expect(mat.uniforms.uCadence.value).toBe(0.4);

      cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, cadence: 1.0 } }));
      expect(mat.uniforms.uCadence.value).toBe(1.0);
    });

    it('T-041-26: Zero bass and treble still allow time-based deformation evolution (not static)', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      const silentParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0 };
      cloud.init(scene, 'silent-evolve-seed', silentParams);
      const mat = getMaterial(scene);

      cloud.draw(scene, makeFrame({ elapsed: 0, params: silentParams }));
      const t0 = mat.uniforms.uTime.value;

      cloud.draw(scene, makeFrame({ elapsed: 30000, params: silentParams }));
      const t1 = mat.uniforms.uTime.value;

      expect(t1).toBeGreaterThan(t0);
    });
  });

  describe('GPU-only deformation (no CPU per-point loops)', () => {
    it('T-041-14: No CPU per-point position buffer writes in draw() — position attribute version unchanged', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'no-cpu-disp-seed', defaultParams);
      const geo = getGeometry(scene);
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const versionBefore = posAttr.version;

      cloud.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 } }));

      expect(posAttr.version).toBe(versionBefore);
    });

    it('T-041-15: RibbonField — no CPU per-point position buffer writes in draw()', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'no-cpu-ribbon-seed', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const geo = points.geometry as THREE.BufferGeometry;
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const versionBefore = posAttr.version;

      ribbon.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 } }));

      expect(posAttr.version).toBe(versionBefore);
    });
  });

  describe('Quality tier scaling', () => {
    it('T-041-20: Low quality tier (noiseOctaves=1) still produces valid shader with uNoiseOctaves=1', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 1 });
      cloud.init(scene, 'low-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(1);
      expect(() => cloud.draw(scene, makeFrame({ elapsed: 100 }))).not.toThrow();
    });

    it('T-041-21: Medium quality tier (noiseOctaves=2) compiles cleanly', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 2 });
      cloud.init(scene, 'med-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(2);
      expect(() => cloud.draw(scene, makeFrame({ elapsed: 100 }))).not.toThrow();
    });

    it('T-041-22: High quality tier (noiseOctaves=3) compiles cleanly', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 3 });
      cloud.init(scene, 'high-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(3);
      expect(() => cloud.draw(scene, makeFrame({ elapsed: 100 }))).not.toThrow();
    });
  });

  describe('Existing displacement layers preserved', () => {
    it('T-041-28: Existing displacement layers preserved — uRadialScale, uTwistStrength, uFieldSpread uniforms still present', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'preserved-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uRadialScale).toBeDefined();
      expect(mat.uniforms.uTwistStrength).toBeDefined();
      expect(mat.uniforms.uFieldSpread).toBeDefined();
      expect(mat.uniforms.uNoiseFrequency).toBeDefined();
    });

    it('T-041-29: Pointer repulsion still works alongside simplex displacement', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ enablePointerRepulsion: true });
      cloud.init(scene, 'pointer-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({
        pointerX: 0.5,
        pointerY: 0.5,
        elapsed: 1000,
        params: { ...defaultParams, pointerDisturbance: 0.8, bassEnergy: 0.5 },
      }));
      expect(mat.uniforms.uPointerDisturbance.value).toBe(0.8);
      expect(mat.uniforms.uEnablePointerRepulsion.value).toBe(1.0);
    });

    it('T-041-19: RibbonField vertex shader contains snoise and fbm3 functions', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'ribbon-noise-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).toContain('snoise');
      expect(mat.vertexShader).toContain('fbm3');
    });
  });

  describe('Privacy', () => {
    it('T-041-30: No localStorage, sessionStorage, or cookie access during shader displacement init or draw', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const ssSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'privacy-disp-seed', defaultParams);
      cloud.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 } }));
      expect(lsSpy).not.toHaveBeenCalled();
      expect(ssSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

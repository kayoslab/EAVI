import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createPointCloud,
  getPointCount,
} from '../../src/visual/systems/pointCloud';
import {
  createRibbonField,
  getPointCount as getRibbonPointCount,
} from '../../src/visual/systems/ribbonField';
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

function getRibbonGeometry(scene: THREE.Scene): THREE.BufferGeometry {
  const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
  return points.geometry as THREE.BufferGeometry;
}

describe('US-041: Shader-based vertex displacement with simplex noise', () => {
  describe('PointCloud simplex noise integration', () => {
    it('T-041-01: PointCloud ShaderMaterial includes uDisplacementScale uniform', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'disp-scale-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uDisplacementScale, 'missing uniform: uDisplacementScale').toBeDefined();
    });

    it('T-041-03: PointCloud vertex shader contains snoise function', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'snoise-pc-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('snoise');
    });

    it('T-041-05: PointCloud vertex shader contains fbm3 function', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'fbm3-pc-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('fbm3');
    });

    it('T-041-18: PointCloud vertex shader no longer contains layeredNoise function', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'no-layered-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).not.toContain('layeredNoise');
    });
  });

  describe('RibbonField simplex noise integration', () => {
    it('T-041-02: RibbonField ShaderMaterial includes uDisplacementScale uniform', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'disp-scale-ribbon-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.uniforms.uDisplacementScale, 'missing uniform: uDisplacementScale').toBeDefined();
    });

    it('T-041-04: RibbonField vertex shader contains snoise function', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'snoise-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).toContain('snoise');
    });

    it('T-041-06: RibbonField vertex shader contains fbm3 function', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'fbm3-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).toContain('fbm3');
    });

    it('T-041-19: RibbonField vertex shader no longer contains layeredNoise function', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'no-layered-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).not.toContain('layeredNoise');
    });
  });

  describe('Bass affects large-scale 3D displacement', () => {
    it('T-041-07: Bass energy sets uBassEnergy and uDisplacementScale > 0 on PointCloud', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'bass-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.8 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
      expect(mat.uniforms.uDisplacementScale.value).toBeGreaterThan(0);
    });

    it('T-041-08: Bass energy sets uBassEnergy and uDisplacementScale > 0 on RibbonField', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'bass-disp-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      ribbon.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.8 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
      expect(mat.uniforms.uDisplacementScale.value).toBeGreaterThan(0);
    });

    it('T-041-09: Zero bass still has non-negative uDisplacementScale', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'zero-bass-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
      expect(mat.uniforms.uDisplacementScale.value).toBeGreaterThanOrEqual(0);
    });

    it('T-041-24: Existing radial expansion displacement is preserved on PointCloud', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'radial-preserve-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(0);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0 } }));
      expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
      expect(mat.vertexShader).toContain('expansion');
    });

    it('T-041-25: Existing twist displacement is preserved in PointCloud shader', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'twist-preserve-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('twistAngle');
      expect(mat.vertexShader).toContain('uTwistStrength');
    });

    it('T-041-28: Existing ribbon sway is preserved in RibbonField shader', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'sway-preserve-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      expect(mat.vertexShader).toContain('ribbonPhase');
      expect(mat.vertexShader).toContain('bassSway');
    });
  });

  describe('Treble affects fine-grain displacement', () => {
    it('T-041-10: Treble energy sets uTrebleEnergy > 0 on PointCloud', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'treble-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.7 } }));
      expect(mat.uniforms.uTrebleEnergy.value).toBe(0.7);
    });

    it('T-041-11: Treble energy sets uTrebleEnergy > 0 on RibbonField', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'treble-disp-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      ribbon.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.7 } }));
      expect(mat.uniforms.uTrebleEnergy.value).toBe(0.7);
    });

    it('T-041-26: Existing treble jitter displacement is preserved in PointCloud shader', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'jitter-preserve-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('trebleJitter');
    });
  });

  describe('Deformation evolves over time', () => {
    it('T-041-12: uTime differs at elapsed=0 vs elapsed=30000 on PointCloud', () => {
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

    it('T-041-13: uTime differs at elapsed=0 vs elapsed=30000 on RibbonField', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'time-evolve-rb-seed', defaultParams);
      const mat = getRibbonMaterial(scene);
      ribbon.draw(scene, makeFrame({ elapsed: 0 }));
      const t0 = mat.uniforms.uTime.value;
      ribbon.draw(scene, makeFrame({ elapsed: 30000 }));
      const t1 = mat.uniforms.uTime.value;
      expect(t1).toBeGreaterThan(t0);
    });

    it('T-041-30: Warp continues when audio is silent — uTime still advances', () => {
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

    it('T-041-32: uCadence uniform reflects cadence for noise evolution speed modulation', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'cadence-noise-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, cadence: 0.4 } }));
      expect(mat.uniforms.uCadence.value).toBe(0.4);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, cadence: 1.0 } }));
      expect(mat.uniforms.uCadence.value).toBe(1.0);
    });
  });

  describe('GPU-only deformation (no CPU per-point loops)', () => {
    it('T-041-14: Position buffer version unchanged after draw() on PointCloud', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'no-cpu-pc-seed', defaultParams);
      const geo = getGeometry(scene);
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const versionBefore = posAttr.version;
      cloud.draw(scene, makeFrame({ elapsed: 5000, params: { ...defaultParams, bassEnergy: 0.9 } }));
      expect(posAttr.version).toBe(versionBefore);
    });

    it('T-041-15: Position buffer version unchanged after draw() on RibbonField', () => {
      const scene = new THREE.Scene();
      const ribbon = createRibbonField();
      ribbon.init(scene, 'no-cpu-rb-seed', defaultParams);
      const geo = getRibbonGeometry(scene);
      const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
      const versionBefore = posAttr.version;
      ribbon.draw(scene, makeFrame({ elapsed: 5000, params: { ...defaultParams, bassEnergy: 0.9 } }));
      expect(posAttr.version).toBe(versionBefore);
    });
  });

  describe('uDisplacementScale derivation from motionAmplitude * structureComplexity', () => {
    it('T-041-16: Reduced motion + low complexity produces uDisplacementScale < 0.3', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      const reducedParams = { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 0.5 };
      cloud.init(scene, 'disp-derive-seed', reducedParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: reducedParams }));
      expect(mat.uniforms.uDisplacementScale.value).toBeLessThan(0.3);
    });

    it('T-041-17: Full motion + high complexity produces higher uDisplacementScale', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      const fullParams = { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 1.0 };
      const reducedParams = { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 0.5 };
      cloud.init(scene, 'disp-compare-seed', fullParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: fullParams }));
      const fullScale = mat.uniforms.uDisplacementScale.value;
      cloud.draw(scene, makeFrame({ params: reducedParams }));
      const reducedScale = mat.uniforms.uDisplacementScale.value;
      expect(fullScale).toBeGreaterThan(reducedScale);
    });

    it('T-041-23: uDisplacementScale updates when frame params change', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'dynamic-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 1.0, structureComplexity: 1.0 } }));
      const scale1 = mat.uniforms.uDisplacementScale.value;
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 0.2, structureComplexity: 0.3 } }));
      const scale2 = mat.uniforms.uDisplacementScale.value;
      expect(scale1).toBeGreaterThan(scale2);
    });

    it('T-041-29: Reduced motion calms displacement compared to full motion', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'reduced-disp-seed', defaultParams);
      const mat = getMaterial(scene);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 1.0 } }));
      const fullScale = mat.uniforms.uDisplacementScale.value;
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 0.2 } }));
      const reducedScale = mat.uniforms.uDisplacementScale.value;
      expect(reducedScale).toBeLessThan(fullScale);
    });
  });

  describe('Quality tier scaling', () => {
    it('T-041-20: Low quality tier (1 octave) produces valid shader uniforms', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 1 });
      cloud.init(scene, 'low-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(1);
      expect(mat.uniforms.uDisplacementScale).toBeDefined();
      expect(() => cloud.draw(scene, makeFrame())).not.toThrow();
    });

    it('T-041-21: Medium quality tier (2 octaves) produces valid shader uniforms', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 2 });
      cloud.init(scene, 'med-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(2);
      expect(() => cloud.draw(scene, makeFrame())).not.toThrow();
    });

    it('T-041-22: High quality tier (3 octaves) produces valid shader uniforms', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud({ noiseOctaves: 3 });
      cloud.init(scene, 'high-tier-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.uniforms.uNoiseOctaves.value).toBe(3);
      expect(() => cloud.draw(scene, makeFrame())).not.toThrow();
    });
  });

  describe('Preserved existing features', () => {
    it('T-041-27: Existing pointer repulsion is preserved in PointCloud shader', () => {
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'pointer-preserve-seed', defaultParams);
      const mat = getMaterial(scene);
      expect(mat.vertexShader).toContain('uPointerDisturbance');
      expect(mat.vertexShader).toContain('uPointerPos');
    });
  });

  describe('Privacy', () => {
    it('T-041-31: No localStorage, sessionStorage, or cookie access during init or draw', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const ssSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const cloud = createPointCloud();
      cloud.init(scene, 'privacy-disp-seed', defaultParams);
      cloud.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.5 } }));
      expect(lsSpy).not.toHaveBeenCalled();
      expect(ssSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createPointCloud } from '../../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../../src/visual/systems/ribbonField';
import { createParticleField, getParticleCount } from '../../../src/visual/systems/particleField';
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

describe('US-041: Shader-based vertex displacement — pointCloud simplex/FBM upgrade', () => {
  it('T-041-01: pointCloud vertex shader contains simplex noise function (snoise), not sine-hash layeredNoise', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'noise-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('snoise');
    expect(mat.vertexShader).not.toContain('layeredNoise');
  });

  it('T-041-02: pointCloud vertex shader contains fbm3 function for layered noise displacement', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'fbm-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('fbm3');
  });

  it('T-041-11: pointCloud vertex shader uses uBassEnergy to scale fbm3 displacement amplitude', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'bass-fbm-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    expect(vs).toContain('uBassEnergy');
    expect(vs).toContain('fbm3');
    const bassSection = vs.substring(vs.indexOf('fbm3'), vs.indexOf('fbm3') + 200);
    expect(bassSection).toContain('uBassEnergy');
  });

  it('T-041-12: pointCloud vertex shader uses uTrebleEnergy with snoise for fine-grain displacement', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'treble-fine-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    expect(vs).toContain('uTrebleEnergy');
    expect(vs).toContain('snoise');
    const pointSizeSection = vs.substring(vs.indexOf('gl_PointSize'));
    expect(pointSizeSection).toContain('uTrebleEnergy');
  });

  it('T-041-15: pointCloud vertex shader uses uTime to drift noise domain for continuous time evolution', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'time-evolve-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    const fbmCall = vs.substring(vs.indexOf('fbm3('), vs.indexOf('fbm3(') + 150);
    expect(fbmCall).toMatch(/uTime|\bt\b/);
  });
});

describe('US-041: Shader-based vertex displacement — ribbonField simplex/FBM upgrade', () => {
  it('T-041-03: ribbonField vertex shader contains simplex noise (snoise) and fbm3, not sine-hash layeredNoise', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'noise-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('snoise');
    expect(mat.vertexShader).toContain('fbm3');
    expect(mat.vertexShader).not.toContain('layeredNoise');
  });

  it('T-041-13: ribbonField vertex shader uses uBassEnergy with fbm3 for bass-driven 3D displacement', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'ribbon-bass-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    expect(vs).toContain('uBassEnergy');
    expect(vs).toContain('fbm3');
    const bassSection = vs.substring(vs.indexOf('fbm3'), vs.indexOf('fbm3') + 200);
    expect(bassSection).toContain('uBassEnergy');
  });

  it('T-041-14: ribbonField vertex shader uses uTrebleEnergy with snoise for treble fine-grain displacement', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'ribbon-treble-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    expect(vs).toContain('uTrebleEnergy');
    expect(vs).toContain('snoise');
    const pointSizeSection = vs.substring(vs.indexOf('gl_PointSize'));
    expect(pointSizeSection).toContain('uTrebleEnergy');
  });

  it('T-041-16: ribbonField vertex shader uses uTime to drift noise domain for time-evolving deformation', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'ribbon-time-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    const fbmCall = vs.substring(vs.indexOf('fbm3('), vs.indexOf('fbm3(') + 150);
    expect(fbmCall).toMatch(/uTime|\bt\b/);
  });
});

describe('US-041: Shader-based vertex displacement — particleField ShaderMaterial migration', () => {
  it('T-041-04: particleField uses ShaderMaterial (not PointsMaterial)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat).not.toBeInstanceOf(THREE.PointsMaterial);
  });

  it('T-041-05: particleField vertex shader contains snoise and curl-noise displacement functions', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'curl-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('snoise');
    expect(mat.vertexShader).toContain('curl3');
  });

  it('T-041-06: particleField has vertex and fragment shaders with non-trivial content', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'shader-content-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader.length).toBeGreaterThan(100);
    expect(mat.fragmentShader.length).toBeGreaterThan(10);
    expect(mat.vertexShader).toContain('gl_Position');
    expect(mat.vertexShader).toContain('gl_PointSize');
  });

  it('T-041-07: particleField ShaderMaterial has uBassEnergy uniform for bass-driven macro displacement', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'bass-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uBassEnergy).toBeDefined();
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0.8 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
  });

  it('T-041-08: particleField ShaderMaterial has uTrebleEnergy uniform for fine-grain displacement', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'treble-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTrebleEnergy).toBeDefined();
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 0.6 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.6);
  });

  it('T-041-09: particleField ShaderMaterial has uTime uniform that updates each frame for time evolution', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'time-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTime).toBeDefined();
    field.draw(scene, makeFrame({ time: 500, elapsed: 500 }));
    expect(mat.uniforms.uTime.value).toBe(500);
    field.draw(scene, makeFrame({ time: 1500, elapsed: 1500 }));
    expect(mat.uniforms.uTime.value).toBe(1500);
  });

  it('T-041-10: particleField draw() does not modify position buffer (GPU handles displacement)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'no-cpu-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const posBefore = Float32Array.from(posAttr.array as Float32Array);
    const versionBefore = posAttr.version;
    field.draw(scene, makeFrame({ time: 1000, elapsed: 1000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0 } }));
    const posAfter = Float32Array.from(posAttr.array as Float32Array);
    expect(posAfter).toEqual(posBefore);
    expect(posAttr.version).toBe(versionBefore);
  });

  it('T-041-17: particleField vertex shader uses uTime inside curl3/noise for time-evolving displacement', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'particle-time-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    const curlCall = vs.substring(vs.indexOf('curl3('), vs.indexOf('curl3(') + 150);
    expect(curlCall).toMatch(/uTime|\bt\b/);
  });

  it('T-041-18: particleField has uNoiseOctaves uniform for quality-tier gated FBM complexity', () => {
    const scene = new THREE.Scene();
    const field = createParticleField({ noiseOctaves: 3 });
    field.init(scene, 'octave-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNoiseOctaves).toBeDefined();
    expect(mat.uniforms.uNoiseOctaves.value).toBe(3);
  });

  it('T-041-19: particleField has uMotionAmplitude uniform that respects reduced-motion scaling', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'motion-amp-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uMotionAmplitude).toBeDefined();
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2 } }));
    expect(mat.uniforms.uMotionAmplitude.value).toBe(0.2);
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0 } }));
    expect(mat.uniforms.uMotionAmplitude.value).toBe(1.0);
  });

  it('T-041-20: particleField uses additive blending with transparency and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'blend-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-041-21: particleField has per-point buffer attributes: aHueOffset, aRandom, size', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    const sizeAttr = geo.getAttribute('size');
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr.itemSize).toBe(1);
    const hueOffsetAttr = geo.getAttribute('aHueOffset');
    expect(hueOffsetAttr).toBeDefined();
    expect(hueOffsetAttr.itemSize).toBe(1);
    const randomAttr = geo.getAttribute('aRandom');
    expect(randomAttr).toBeDefined();
    expect(randomAttr.itemSize).toBe(3);
  });

  it('T-041-22: particleField has uPointerPos and uPointerDisturbance uniforms for pointer repulsion', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'pointer-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPointerPos).toBeDefined();
    expect(mat.uniforms.uPointerDisturbance).toBeDefined();
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, pointerX: 0.7, pointerY: 0.3, params: { ...defaultParams, pointerDisturbance: 0.5 } }));
    expect(mat.uniforms.uPointerDisturbance.value).toBe(0.5);
  });

  it('T-041-23: particleField has uPaletteHue uniform for GPU-side color computation', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'palette-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPaletteHue).toBeDefined();
    field.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, paletteHue: 240 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(240);
  });

  it('T-041-24: particleField vertex shader contains HSL to RGB conversion (hsl2rgb)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'hsl-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('hsl2rgb');
  });

  it('T-041-34: particleField vertex shader contains uBassEnergy multiplied with curl3 for macro displacement', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'bass-curl-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    expect(vs).toContain('curl3');
    expect(vs).toContain('uBassEnergy');
    const curlIdx = vs.indexOf('curl3(');
    const bassInContext = vs.substring(Math.max(0, curlIdx - 50), curlIdx + 200);
    expect(bassInContext).toContain('uBassEnergy');
  });

  it('T-041-35: particleField vertex shader modulates gl_PointSize by uTrebleEnergy for sparkle effect', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'treble-size-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const vs = mat.vertexShader;
    const pointSizeSection = vs.substring(vs.indexOf('gl_PointSize'));
    expect(pointSizeSection).toContain('uTrebleEnergy');
  });
});

describe('US-041: Shader-based vertex displacement — particleField regression after migration', () => {
  it('T-041-26: particleField cleanup() still removes mesh and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    field.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-041-27: particleField draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'safe-seed', defaultParams);
    expect(() => field.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
    expect(() => field.draw(scene, makeFrame({ time: 2000, elapsed: 2000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0, pointerDisturbance: 1.0 }, pointerX: 0.5, pointerY: 0.5 }))).not.toThrow();
  });

  it('T-041-28: particleField determinism preserved after ShaderMaterial migration', () => {
    const scene1 = new THREE.Scene();
    const a = createParticleField();
    a.init(scene1, 'det-seed', defaultParams);
    const posA = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const b = createParticleField();
    b.init(scene2, 'det-seed', defaultParams);
    const posB = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    expect(posA).toEqual(posB);
  });

  it('T-041-29: particleField density and maxParticles scaling still works', () => {
    const scene = new THREE.Scene();
    const fieldLow = createParticleField({ maxParticles: 150 });
    fieldLow.init(scene, 'scale-seed', { ...defaultParams, density: 0.5 });
    const lowCount = getParticleCount(fieldLow);

    const fieldHigh = createParticleField({ maxParticles: 600 });
    fieldHigh.init(scene, 'scale-seed', { ...defaultParams, density: 1.0 });
    const highCount = getParticleCount(fieldHigh);

    expect(highCount).toBeGreaterThan(lowCount);
    expect(lowCount).toBeLessThanOrEqual(150);
  });

  it('T-041-30: no localStorage or cookie access during particleField init/draw', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'privacy-seed', defaultParams);
    field.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-041-31: particleField config accepts noiseOctaves, enablePointerRepulsion, enableSlowModulation', () => {
    const scene = new THREE.Scene();
    const field = createParticleField({
      maxParticles: 300,
      enableSparkle: true,
      noiseOctaves: 2,
      enablePointerRepulsion: true,
      enableSlowModulation: true,
    });
    field.init(scene, 'config-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNoiseOctaves.value).toBe(2);
    expect(mat.uniforms.uEnablePointerRepulsion.value).toBeCloseTo(1.0);
    expect(mat.uniforms.uEnableSlowModulation.value).toBeCloseTo(1.0);
  });

  it('T-041-32: particleField with enablePointerRepulsion=false sets uEnablePointerRepulsion uniform to 0', () => {
    const scene = new THREE.Scene();
    const field = createParticleField({ enablePointerRepulsion: false });
    field.init(scene, 'no-ptr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uEnablePointerRepulsion.value).toBeCloseTo(0.0);
  });
});

describe('US-041: Shader-based vertex displacement — shared noise module', () => {
  it('T-041-25: all three systems share the same noise3d.glsl source (snoise function present in all vertex shaders)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'shared-noise-seed', defaultParams);
    const cloudMat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    const scene2 = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene2, 'shared-noise-seed', defaultParams);
    const ribbonMat = (scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    const scene3 = new THREE.Scene();
    const field = createParticleField();
    field.init(scene3, 'shared-noise-seed', defaultParams);
    const fieldMat = (scene3.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    expect(cloudMat.vertexShader).toContain('snoise');
    expect(ribbonMat.vertexShader).toContain('snoise');
    expect(fieldMat.vertexShader).toContain('snoise');
  });

  it('T-041-33: noise3d.glsl file exists as a shared GLSL module', async () => {
    const noise3dSrc = await import('../../../src/visual/shaders/noise3d.glsl?raw').then(m => m.default);
    expect(noise3dSrc).toBeDefined();
    expect(typeof noise3dSrc).toBe('string');
    expect(noise3dSrc).toContain('snoise');
    expect(noise3dSrc).toContain('fbm3');
    expect(noise3dSrc).toContain('curl3');
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createFlowRibbonField, getPointCount, getPointPositions } from '../../../src/visual/systems/flowRibbonField';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';

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

function makeFrame(overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
}

describe('US-063: FlowRibbonField geometry system', () => {
  it('T-063-01: init creates THREE.Points mesh in scene', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'mesh-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
    const lineMeshes = scene.children.filter((c) => c instanceof THREE.Line);
    expect(lineMeshes.length).toBe(0);
  });

  it('T-063-02: mesh uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-063-03: vertex shader contains curl3 call for flow-field displacement', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'curl-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('curl3');
  });

  it('T-063-04: vertex shader references uBassEnergy for flow speed modulation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'bass-shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('uBassEnergy');
  });

  it('T-063-05: vertex shader references uTrebleEnergy for turbulence modulation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'treble-shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('uTrebleEnergy');
  });

  it('T-063-06: fragment shader uses gl_PointCoord for elongated sprite rendering', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'frag-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('gl_PointCoord');
  });

  it('T-063-07: vertex shader passes elongation varying to fragment shader', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'elong-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('vElongation');
    expect(mat.fragmentShader).toContain('vElongation');
  });

  it('T-063-08: geometry has required attributes: position(3), color(3), aHueOffset(1), aRandom(3)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
    expect(geo.getAttribute('aVertexColor').itemSize).toBe(3);
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aRandom').itemSize).toBe(3);
  });

  it('T-063-09: optional size attribute has itemSize 1 when present', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'size-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const sizeAttr = geo.getAttribute('size');
    if (sizeAttr) {
      expect(sizeAttr.itemSize).toBe(1);
    }
  });

  it('T-063-10: all buffer attributes contain only finite values after init', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    for (const name of ['position', 'aVertexColor', 'aRandom']) {
      const arr = geo.getAttribute(name).array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });

  it('T-063-11: point positions have non-zero Z-depth confirming 3D distribution', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'depth-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = posArr.length / 3;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-063-12: same seed produces same initial point configuration', () => {
    const scene = new THREE.Scene();
    const a = createFlowRibbonField();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createFlowRibbonField();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getPointPositions(a)).toEqual(getPointPositions(b));
  });

  it('T-063-13: different seeds produce different configurations', () => {
    const scene = new THREE.Scene();
    const a = createFlowRibbonField();
    a.init(scene, 'seed-one', defaultParams);
    const b = createFlowRibbonField();
    b.init(scene, 'seed-two', defaultParams);
    expect(getPointPositions(a)).not.toEqual(getPointPositions(b));
  });

  it('T-063-14: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'draw-seed', defaultParams);
    expect(() => flow.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-063-15: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    const params = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    flow.init(scene, 'edge-seed', params);
    expect(() => flow.draw(scene, makeFrame({ params, pointerX: undefined, pointerY: undefined }))).not.toThrow();
  });

  it('T-063-16: draw does not throw at boundary parameter values', () => {
    const scene = new THREE.Scene();
    const combos: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0, motionAmplitude: 0.2 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1, motionAmplitude: 1 },
      { curveSoftness: 0, structureComplexity: 0 },
      { curveSoftness: 1, structureComplexity: 1 },
    ];
    for (const combo of combos) {
      const params = { ...defaultParams, ...combo };
      const flow = createFlowRibbonField();
      flow.init(scene, 'boundary-seed', params);
      expect(() => flow.draw(scene, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-063-17: draw updates uBassEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'bass-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.8 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
  });

  it('T-063-18: draw updates uTrebleEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'treble-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.6 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.6);
  });

  it('T-063-19: bass and treble are mapped to distinct uniforms', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'distinct-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-063-20: draw updates uTime uniform over successive frames', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'time-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(mat.uniforms.uTime.value).toBe(100);
    flow.draw(scene, makeFrame({ time: 500, elapsed: 500 }));
    expect(mat.uniforms.uTime.value).toBe(500);
  });

  it('T-063-21: material uses additive blending with transparency and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'blend-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-063-22: vertex shader is distinct from existing warp shaders (uses flow advection, not radial expansion)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'distinct-shader-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // Must use curl3 for flow-field advection
    expect(mat.vertexShader).toContain('curl3');
    // Must have vElongation for streak rendering (unique to flowRibbon)
    expect(mat.vertexShader).toContain('vElongation');
    // Should NOT have ribbonPhase (ribbonWarp pattern) or quantized noise (crystalWarp pattern)
    expect(mat.vertexShader).not.toContain('ribbonPhase');
    expect(mat.vertexShader).not.toContain('floor(rawNoise');
  });

  it('T-063-23: init creates points based on density and maxPoints config', () => {
    const scene = new THREE.Scene();
    const low = createFlowRibbonField({ maxPoints: 500 });
    low.init(scene, 'seed-a', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(low);
    const high = createFlowRibbonField({ maxPoints: 500 });
    high.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(high);
    expect(highCount).toBeGreaterThan(lowCount);
    const capped = createFlowRibbonField({ maxPoints: 100 });
    capped.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    expect(getPointCount(capped)).toBeLessThanOrEqual(100);
  });

  it('T-063-24: cleanup removes mesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    flow.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-063-25: setOpacity updates uOpacity uniform', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'opacity-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.setOpacity!(0.5);
    expect(mat.uniforms.uOpacity.value).toBe(0.5);
    flow.setOpacity!(1.0);
    expect(mat.uniforms.uOpacity.value).toBe(1.0);
  });

  it('T-063-26: mesh rotation changes over elapsed time (Y-axis drift)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'drift-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    flow.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    flow.draw(scene, makeFrame({ elapsed: 5000 }));
    const rotY1 = points.rotation.y;
    expect(rotY1).not.toBeCloseTo(rotY0, 5);
  });

  it('T-063-27: paletteHue is passed to GPU via uPaletteHue uniform', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-063-28: shader has uFlowScale uniform for advection strength control', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'flow-scale-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uFlowScale).toBeDefined();
    expect(typeof mat.uniforms.uFlowScale.value).toBe('number');
  });

  it('T-063-29: no localStorage or cookie access during flow ribbon operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', { get: cookieGet, configurable: true });
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'privacy-seed', defaultParams);
    flow.draw(scene, makeFrame());
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });

  it('T-063-30: position buffer values are finite at boundary params', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0 },
      { density: 1, structureComplexity: 1, curveSoftness: 0 },
    ];
    for (const b of boundaries) {
      const flow = createFlowRibbonField();
      flow.init(scene, 'boundary-finite-seed', { ...defaultParams, ...b });
      const points = scene.children.filter((c) => c instanceof THREE.Points).pop() as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      for (let i = 0; i < posArr.length; i++) {
        expect(Number.isFinite(posArr[i])).toBe(true);
      }
    }
  });

  it('T-063-34: flowribbon mode is importable and implements GeometrySystem interface', () => {
    const flow = createFlowRibbonField();
    expect(typeof flow.init).toBe('function');
    expect(typeof flow.draw).toBe('function');
    expect(typeof flow.cleanup).toBe('function');
    expect(typeof flow.setOpacity).toBe('function');
  });

  it('T-063-35: fragment shader includes fog/depth attenuation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'fog-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('uFogNear');
    expect(mat.fragmentShader).toContain('uFogFar');
  });
});

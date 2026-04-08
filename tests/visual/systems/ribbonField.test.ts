import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createRibbonField, getPointCount, getPointPositions } from '../../../src/visual/systems/ribbonField';
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

describe('US-034: RibbonField geometry system', () => {
  it('T-034-01: init creates points based on density and maxPoints config', () => {
    const scene = new THREE.Scene();

    const low = createRibbonField({ maxPoints: 500 });
    low.init(scene, 'seed-a', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(low);

    const high = createRibbonField({ maxPoints: 500 });
    high.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(high);

    expect(highCount).toBeGreaterThan(lowCount);

    const capped = createRibbonField({ maxPoints: 100 });
    capped.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    expect(getPointCount(capped)).toBeLessThanOrEqual(100);
  });

  it('T-034-02: same seed produces same initial point configuration', () => {
    const scene = new THREE.Scene();

    const a = createRibbonField();
    a.init(scene, 'deterministic-seed', defaultParams);

    const b = createRibbonField();
    b.init(scene, 'deterministic-seed', defaultParams);

    expect(getPointPositions(a)).toEqual(getPointPositions(b));
  });

  it('T-034-03: different seeds produce different configurations', () => {
    const scene = new THREE.Scene();

    const a = createRibbonField();
    a.init(scene, 'seed-one', defaultParams);

    const b = createRibbonField();
    b.init(scene, 'seed-two', defaultParams);

    expect(getPointPositions(a)).not.toEqual(getPointPositions(b));
  });

  it('T-034-04: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'test-seed', defaultParams);

    expect(() => ribbon.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-034-05: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    ribbon.init(scene, 'edge-seed', params);

    expect(() => ribbon.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-034-06: draw does not throw at boundary parameter values', () => {
    const scene = new THREE.Scene();

    const combos: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0, motionAmplitude: 0.2 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1, motionAmplitude: 1 },
      { curveSoftness: 0, structureComplexity: 0 },
      { curveSoftness: 1, structureComplexity: 1 },
    ];

    for (const combo of combos) {
      const params = { ...defaultParams, ...combo };
      const ribbon = createRibbonField();
      ribbon.init(scene, 'boundary-seed', params);
      expect(() => ribbon.draw(scene, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-034-07: init adds THREE.Points to scene (not THREE.Line or THREE.Group of Lines)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'mesh-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
    const lineMeshes = scene.children.filter((c) => c instanceof THREE.Line);
    expect(lineMeshes.length).toBe(0);
  });

  it('T-034-08: points have position, color, size, aHueOffset, aRandom buffer attributes', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;

    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);

    const vertexColorAttr = geo.getAttribute('aVertexColor');
    expect(vertexColorAttr).toBeDefined();
    expect(vertexColorAttr.itemSize).toBe(3);

    const sizeAttr = geo.getAttribute('size');
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr.itemSize).toBe(1);

    const randomAttr = geo.getAttribute('aRandom');
    expect(randomAttr).toBeDefined();
    expect(randomAttr.itemSize).toBe(3);
  });

  it('T-034-09: draw updates shader uniforms including bassEnergy and trebleEnergy', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    ribbon.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0.7, trebleEnergy: 0.4 } }));

    expect(mat.uniforms.uTime.value).toBe(100);
    expect(mat.uniforms.uBassEnergy.value).toBe(0.7);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.4);
  });

  it('T-034-10: bass and treble are mapped to distinct uniforms (uBassEnergy vs uTrebleEnergy)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'distinct-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    ribbon.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0, trebleEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    ribbon.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    ribbon.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-034-11: cleanup removes mesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    ribbon.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-034-12: no localStorage or cookie access during ribbon operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', {
      get: cookieGet,
      configurable: true,
    });

    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'privacy-seed', defaultParams);
    ribbon.draw(scene, makeFrame());

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });

  it('T-034-13: point positions have non-zero Z-depth confirming 3D distribution', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'depth-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = getPointCount(ribbon);
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-034-14: mesh uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-034-15: material uses additive blending with transparency and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'blend-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-034-16: mesh rotation changes over elapsed time (Y-axis drift)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'drift-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    ribbon.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    ribbon.draw(scene, makeFrame({ elapsed: 5000 }));
    const rotY1 = points.rotation.y;
    expect(rotY1).not.toBeCloseTo(rotY0, 5);
  });

  it('T-034-17: colors derive from paletteHue (uPaletteHue uniform reflects param)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    ribbon.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    ribbon.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 180 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(180);
  });

  it('T-034-18: low motionAmplitude produces smaller uMotionAmplitude uniform than high', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'motion-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    ribbon.draw(scene, makeFrame({ elapsed: 100, params: lowParams }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    ribbon.draw(scene, makeFrame({ elapsed: 100, params: highParams }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  it('T-034-19: density parameter scales effective point count (higher density = more points)', () => {
    const scene = new THREE.Scene();
    const ribbonLow = createRibbonField();
    ribbonLow.init(scene, 'density-seed', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(ribbonLow);

    const ribbonHigh = createRibbonField();
    ribbonHigh.init(scene, 'density-seed', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(ribbonHigh);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-034-20: point count never exceeds the configured maxPoints', () => {
    const scene = new THREE.Scene();
    const maxPoints = 300;
    const ribbon = createRibbonField({ maxPoints });
    ribbon.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getPointCount(ribbon)).toBeLessThanOrEqual(maxPoints);
  });
});

describe('US-050: RibbonField geometry attribute validation', () => {
  it('T-050-24: init() succeeds with valid seed and params (geometry passes validation)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    expect(() => ribbon.init(scene, 'valid-seed', defaultParams)).not.toThrow();
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-050-25: geometry has all required attributes after init: position(3), size(1), aRandom(3), aVertexColor(3)', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'attr-seed', defaultParams);
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

  it('T-050-26: position buffer contains only finite values after init', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    for (let i = 0; i < posArr.length; i++) {
      expect(Number.isFinite(posArr[i])).toBe(true);
    }
  });

  it('T-050-27: all buffer attributes contain only finite values after init', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'all-finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    for (const name of ['aVertexColor', 'size', 'aRandom']) {
      const arr = geo.getAttribute(name).array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });

  it('T-050-28: position buffer values are finite at boundary params', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0 },
      { density: 1, structureComplexity: 1, curveSoftness: 0 },
    ];
    for (const b of boundaries) {
      const ribbon = createRibbonField();
      ribbon.init(scene, 'boundary-finite-seed', { ...defaultParams, ...b });
      const points = scene.children.filter((c) => c instanceof THREE.Points).pop() as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      for (let i = 0; i < posArr.length; i++) {
        expect(Number.isFinite(posArr[i])).toBe(true);
      }
    }
  });
});

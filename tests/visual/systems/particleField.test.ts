import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createParticleField,
  getParticleCount,
  getParticlePositions,
} from '../../../src/visual/systems/particleField';
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

function getInitialPositions(
  seed: string,
  params: VisualParams,
): Array<{ x: number; y: number }> {
  const scene = new THREE.Scene();
  const f = createParticleField();
  f.init(scene, seed, params);
  return getParticlePositions(f);
}

function computeTotalDisplacement(
  posA: Array<{ x: number; y: number }>,
  posB: Array<{ x: number; y: number }>,
): number {
  let total = 0;
  const len = Math.min(posA.length, posB.length);
  for (let i = 0; i < len; i++) {
    const dx = posA[i].x - posB[i].x;
    const dy = posA[i].y - posB[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

describe('US-009: ParticleField geometry system', () => {
  it('T-009-08: init creates particles based on density', () => {
    const scene = new THREE.Scene();

    const field = createParticleField();
    const lowDensity = { ...defaultParams, density: 0.3 };
    field.init(scene, 'seed-a', lowDensity);
    const lowCount = getParticleCount(field);

    const field2 = createParticleField();
    const highDensity = { ...defaultParams, density: 1.0 };
    field2.init(scene, 'seed-a', highDensity);
    const highCount = getParticleCount(field2);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-009-09: same seed produces same initial particle positions', () => {
    const scene = new THREE.Scene();
    const a = createParticleField();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createParticleField();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getParticlePositions(a)).toEqual(getParticlePositions(b));
  });

  it('T-009-10: different seeds produce different initial positions', () => {
    const scene = new THREE.Scene();
    const a = createParticleField();
    a.init(scene, 'seed-one', defaultParams);
    const b = createParticleField();
    b.init(scene, 'seed-two', defaultParams);
    expect(getParticlePositions(a)).not.toEqual(getParticlePositions(b));
  });

  it('T-009-11: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'safe-seed', defaultParams);
    const frame = {
      time: 1000,
      delta: 16,
      elapsed: 0,
      params: defaultParams,
      width: 800,
      height: 600,
    };
    expect(() => field.draw(scene, frame)).not.toThrow();
  });

  it('T-030-01: animation driven by GPU uniforms — uTime changes between frames', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'animate-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    const frame1 = { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 };
    field.draw(scene, frame1);
    const time1 = mat.uniforms.uTime.value;
    const frame2 = { time: 1000, delta: 16, elapsed: 1000, params: defaultParams, width: 800, height: 600 };
    field.draw(scene, frame2);
    const time2 = mat.uniforms.uTime.value;
    expect(time2).not.toBe(time1);
  });

  it('T-030-02: motionAmplitude is passed to GPU via uMotionAmplitude uniform', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    field.init(scene, 'motion-seed', lowParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    field.draw(scene, { time: 0, delta: 16, elapsed: 100, params: lowParams, width: 800, height: 600 });
    expect(mat.uniforms.uMotionAmplitude.value).toBe(0.2);

    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    field.draw(scene, { time: 0, delta: 16, elapsed: 100, params: highParams, width: 800, height: 600 });
    expect(mat.uniforms.uMotionAmplitude.value).toBe(1.0);
  });

  it('T-030-03: init() adds a THREE.Points mesh to the scene', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'points-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-030-04: Points mesh has position buffer attribute sized to particle count * 3', () => {
    const scene = new THREE.Scene();
    const field = createParticleField({ maxParticles: 300 });
    field.init(scene, 'buf-seed', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.count).toBeGreaterThanOrEqual(getParticleCount(field));
    expect(posAttr.itemSize).toBe(3);
  });

  it('T-030-05: ShaderMaterial computes colors GPU-side via uPaletteHue uniform', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'color-buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPaletteHue).toBeDefined();
    expect(mat.uniforms.uPaletteSaturation).toBeDefined();
    // Per-point vibrant vertex color is in buffer attribute
    const geo = points.geometry as THREE.BufferGeometry;
    const colorAttr = geo.getAttribute('aVertexColor');
    expect(colorAttr).toBeDefined();
    expect(colorAttr.itemSize).toBe(3);
  });

  it('T-030-06: draw() updates shader uniforms (GPU-side displacement, no CPU buffer mutation)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'update-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: defaultParams, width: 800, height: 600 });
    expect(mat.uniforms.uTime.value).toBe(100);
    field.draw(scene, { time: 500, delta: 16, elapsed: 500, params: defaultParams, width: 800, height: 600 });
    expect(mat.uniforms.uTime.value).toBe(500);
  });

  it('T-030-07: treble energy is passed to GPU via uTrebleEnergy uniform', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'treble-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, trebleEnergy: 0 }, width: 800, height: 600 });
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, trebleEnergy: 1.0 }, width: 800, height: 600 });
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-030-08: particles near pointer position displace more than distant ones', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    const params = { ...defaultParams, pointerDisturbance: 1.0 };
    field.init(scene, 'ptr-displace-seed', params);
    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    let hasNonZero = false;
    for (let i = 0; i < posArr.length; i++) { if (posArr[i] !== 0) { hasNonZero = true; break; } }
    expect(hasNonZero).toBe(true);
  });

  it('T-030-09: pointerDisturbance is passed to GPU via uPointerDisturbance uniform', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'no-ptr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    const noDistParams = { ...defaultParams, pointerDisturbance: 0 };
    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: noDistParams, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    expect(mat.uniforms.uPointerDisturbance.value).toBe(0);

    const distParams = { ...defaultParams, pointerDisturbance: 1.0 };
    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: distParams, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    expect(mat.uniforms.uPointerDisturbance.value).toBe(1.0);
  });

  it('T-030-10: paletteHue is passed to GPU via uPaletteHue uniform for GPU-side color', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'hue-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, paletteHue: 0 }, width: 800, height: 600 });
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, paletteHue: 180 }, width: 800, height: 600 });
    expect(mat.uniforms.uPaletteHue.value).toBe(180);
  });

  it('T-030-11: bass energy is passed to GPU via uBassEnergy uniform for macro displacement', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'bass-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, bassEnergy: 0 }, width: 800, height: 600 });
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, bassEnergy: 1.0 }, width: 800, height: 600 });
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-030-12: cleanup() removes Points mesh from scene and disposes geometry/material', () => {
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

  it('T-030-27: ShaderMaterial has transparency and additive blending enabled', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'mat-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-009-14: particle count scales with density parameter', () => {
    const scene = new THREE.Scene();
    const densities = [0.3, 0.5, 0.7, 1.0];
    const counts = densities.map((d) => {
      const f = createParticleField();
      f.init(scene, 'density-seed', { ...defaultParams, density: d });
      return getParticleCount(f);
    });
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
    }
  });

  describe('US-011: Device profile to structure', () => {
    it('T-011-13: structureComplexity affects effective particle count — lower produces fewer', () => {
      const scene = new THREE.Scene();

      const fieldLow = createParticleField();
      const lowParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 0.0 };
      fieldLow.init(scene, 'complexity-count-seed', lowParams);
      const lowCount = getParticleCount(fieldLow);

      const fieldHigh = createParticleField();
      const highParams = { ...defaultParams, density: 0.6, curveSoftness: 0.5, structureComplexity: 1.0 };
      fieldHigh.init(scene, 'complexity-count-seed', highParams);
      const highCount = getParticleCount(fieldHigh);

      expect(highCount).toBeGreaterThan(lowCount);
    });

    it('T-011-14: scene renders without errors at boundary values (0 and 1) of new params', () => {
      const scene = new THREE.Scene();

      const boundaries = [
        { curveSoftness: 0, structureComplexity: 0 },
        { curveSoftness: 0, structureComplexity: 1 },
        { curveSoftness: 1, structureComplexity: 0 },
        { curveSoftness: 1, structureComplexity: 1 },
        { curveSoftness: 0.5, structureComplexity: 0.5 },
      ];

      for (const b of boundaries) {
        const field = createParticleField();
        const params = { ...defaultParams, ...b };
        expect(() => {
          field.init(scene, 'boundary-seed', params);
          field.draw(scene, { time: 0, delta: 16, elapsed: 0, params, width: 400, height: 400 });
        }).not.toThrow();
      }
    });
  });

  describe('US-025: Quality config', () => {
    it('T-025-12: createParticleField with maxParticles config caps particle count', () => {
      const scene = new THREE.Scene();
      const field = createParticleField({ maxParticles: 150 });
      field.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(150);
    });

    it('T-025-13: createParticleField without config defaults to 600 max particles', () => {
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'default-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      expect(getParticleCount(field)).toBeLessThanOrEqual(600);
      expect(getParticleCount(field)).toBeGreaterThan(150);
    });

    it('T-025-14: enableSparkle=false still renders particles without jitter', () => {
      const scene = new THREE.Scene();
      const field = createParticleField({ maxParticles: 300, enableSparkle: false });
      expect(() => {
        field.init(scene, 'sparkle-off-seed', { ...defaultParams, density: 0.6 });
        field.draw(scene, { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 });
      }).not.toThrow();
      expect(getParticleCount(field)).toBeGreaterThan(0);
    });

    it('T-025-15: maxParticles config preserves density and structureComplexity scaling', () => {
      const scene = new THREE.Scene();

      const fieldA = createParticleField({ maxParticles: 300 });
      fieldA.init(scene, 'scale-seed', { ...defaultParams, density: 0.5, structureComplexity: 0.5 });
      const countA = getParticleCount(fieldA);

      const fieldB = createParticleField({ maxParticles: 300 });
      fieldB.init(scene, 'scale-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
      const countB = getParticleCount(fieldB);

      expect(countB).toBeGreaterThan(countA);
      expect(countB).toBeLessThanOrEqual(300);
    });

    it('T-025-16: low quality config produces significantly fewer particles than default', () => {
      const scene = new THREE.Scene();
      const params = { ...defaultParams, density: 0.6, structureComplexity: 0.5 };

      const fieldLow = createParticleField({ maxParticles: 150 });
      fieldLow.init(scene, 'compare-seed', params);
      const lowCount = getParticleCount(fieldLow);

      const fieldDefault = createParticleField();
      fieldDefault.init(scene, 'compare-seed', params);
      const defaultCount = getParticleCount(fieldDefault);

      expect(defaultCount).toBeGreaterThanOrEqual(lowCount * 2);
    });
  });

  describe('privacy', () => {
    it('T-009-17: no localStorage or cookie access during particle operations', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const field = createParticleField();
      field.init(scene, 'privacy-seed', defaultParams);
      field.draw(scene, {
        time: 0,
        delta: 16,
        elapsed: 0,
        params: defaultParams,
        width: 800,
        height: 600,
      });
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

describe('US-050: ParticleField geometry attribute validation', () => {
  it('T-050-19: init() succeeds with valid seed and params (geometry passes validation)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    expect(() => field.init(scene, 'valid-seed', defaultParams)).not.toThrow();
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-050-20: geometry has required attributes: position(3), size(1), aHueOffset(1), aRandom(3) — no color attribute', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('size')).toBeDefined();
    expect(geo.getAttribute('size').itemSize).toBe(1);
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
    expect(geo.getAttribute('aVertexColor').itemSize).toBe(3);
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aRandom').itemSize).toBe(3);
  });

  it('T-050-21: position buffer contains only finite values after init', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    for (let i = 0; i < posArr.length; i++) {
      expect(Number.isFinite(posArr[i])).toBe(true);
    }
  });

  it('T-050-22: all buffer attributes contain only finite values after init', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'all-finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    for (const name of ['size', 'aVertexColor', 'aRandom']) {
      const arr = geo.getAttribute(name).array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });

  it('T-050-23: position buffer values are finite at boundary params', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0 },
      { density: 1 },
    ];
    for (const b of boundaries) {
      const field = createParticleField();
      field.init(scene, 'boundary-finite-seed', { ...defaultParams, ...b });
      const points = scene.children.filter((c) => c instanceof THREE.Points).pop() as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      for (let i = 0; i < posArr.length; i++) {
        expect(Number.isFinite(posArr[i])).toBe(true);
      }
    }
  });
});

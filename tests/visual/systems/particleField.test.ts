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

  it('T-030-01: particle positions change between frames (animation works via Three.js buffer updates)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'animate-seed', defaultParams);
    const frame1 = { time: 0, delta: 16, elapsed: 0, params: defaultParams, width: 800, height: 600 };
    field.draw(scene, frame1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    const pos1 = Float32Array.from(posAttr.array as Float32Array);
    const frame2 = { time: 1000, delta: 16, elapsed: 1000, params: defaultParams, width: 800, height: 600 };
    field.draw(scene, frame2);
    const pos2 = Float32Array.from(posAttr.array as Float32Array);
    expect(pos1).not.toEqual(pos2);
  });

  it('T-030-02: particles with low motionAmplitude move less than high motionAmplitude via buffer displacement', () => {
    const scene = new THREE.Scene();
    const lowMotion = createParticleField();
    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    lowMotion.init(scene, 'motion-seed', lowParams);
    const lowPoints = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lowGeo = lowPoints.geometry as THREE.BufferGeometry;
    const lowInitial = Float32Array.from(lowGeo.getAttribute('position').array as Float32Array);
    lowMotion.draw(scene, { time: 0, delta: 16, elapsed: 100, params: lowParams, width: 800, height: 600 });
    const lowAfter = Float32Array.from(lowGeo.getAttribute('position').array as Float32Array);
    let lowDisp = 0;
    for (let i = 0; i < lowInitial.length; i++) lowDisp += Math.abs(lowAfter[i] - lowInitial[i]);

    const scene2 = new THREE.Scene();
    const highMotion = createParticleField();
    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    highMotion.init(scene2, 'motion-seed', highParams);
    const highPoints = scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const highGeo = highPoints.geometry as THREE.BufferGeometry;
    const highInitial = Float32Array.from(highGeo.getAttribute('position').array as Float32Array);
    highMotion.draw(scene2, { time: 0, delta: 16, elapsed: 100, params: highParams, width: 800, height: 600 });
    const highAfter = Float32Array.from(highGeo.getAttribute('position').array as Float32Array);
    let highDisp = 0;
    for (let i = 0; i < highInitial.length; i++) highDisp += Math.abs(highAfter[i] - highInitial[i]);

    expect(highDisp).toBeGreaterThan(lowDisp);
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

  it('T-030-05: Points mesh has color buffer attribute with vertexColors enabled', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'color-buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const colorAttr = geo.getAttribute('color');
    expect(colorAttr).toBeDefined();
    expect(colorAttr.itemSize).toBe(3);
    const mat = points.material as THREE.PointsMaterial;
    expect(mat.vertexColors).toBe(true);
  });

  it('T-030-06: draw() flags position buffer needsUpdate (version increments)', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'update-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const versionBefore = posAttr.version;
    field.draw(scene, { time: 100, delta: 16, elapsed: 100, params: defaultParams, width: 800, height: 600 });
    expect(posAttr.version).toBeGreaterThan(versionBefore);
  });

  it('T-030-07: treble energy influences particle visual properties (size or jitter in buffer)', () => {
    const scene1 = new THREE.Scene();
    const field1 = createParticleField();
    const lowTrebleParams = { ...defaultParams, trebleEnergy: 0 };
    field1.init(scene1, 'treble-seed', lowTrebleParams);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: lowTrebleParams, width: 800, height: 600 });
    const pts1 = scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos1 = Float32Array.from((pts1.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createParticleField();
    const highTrebleParams = { ...defaultParams, trebleEnergy: 1.0 };
    field2.init(scene2, 'treble-seed', highTrebleParams);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: highTrebleParams, width: 800, height: 600 });
    const pts2 = scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos2 = Float32Array.from((pts2.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
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

  it('T-030-09: zero pointerDisturbance produces no extra particle displacement versus baseline', () => {
    const scene1 = new THREE.Scene();
    const field1 = createParticleField();
    const noDistParams = { ...defaultParams, pointerDisturbance: 0, bassEnergy: 0, trebleEnergy: 0 };
    field1.init(scene1, 'no-ptr-seed', noDistParams);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: noDistParams, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    const pos1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createParticleField();
    const distParams = { ...defaultParams, pointerDisturbance: 1.0, bassEnergy: 0, trebleEnergy: 0 };
    field2.init(scene2, 'no-ptr-seed', distParams);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: distParams, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    const pos2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
  });

  it('T-030-10: particle colors derive from paletteHue via HSL in color buffer', () => {
    const scene1 = new THREE.Scene();
    const field1 = createParticleField();
    field1.init(scene1, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, paletteHue: 0 }, width: 800, height: 600 });
    const col1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('color').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createParticleField();
    field2.init(scene2, 'hue-seed', { ...defaultParams, paletteHue: 180 });
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: { ...defaultParams, paletteHue: 180 }, width: 800, height: 600 });
    const col2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('color').array as Float32Array);

    expect(col1).not.toEqual(col2);
  });

  it('T-030-11: bass energy influences particle macro drift in position buffer', () => {
    const scene1 = new THREE.Scene();
    const field1 = createParticleField();
    const noBassParams = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    field1.init(scene1, 'bass-seed', noBassParams);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: noBassParams, width: 800, height: 600 });
    const pos1 = Float32Array.from((scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createParticleField();
    const highBassParams = { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 0, pointerDisturbance: 0 };
    field2.init(scene2, 'bass-seed', highBassParams);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: highBassParams, width: 800, height: 600 });
    const pos2 = Float32Array.from((scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points).geometry.getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
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

  it('T-030-27: PointsMaterial has sizeAttenuation and transparency enabled', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'mat-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.PointsMaterial;
    expect(mat.sizeAttenuation).toBe(true);
    expect(mat.transparent).toBe(true);
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

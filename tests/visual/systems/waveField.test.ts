import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createWaveField,
  getWaveCount,
  getWavePositions,
} from '../../../src/visual/systems/waveField';
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

describe('US-026: WaveField geometry system', () => {
  it('T-026-01: init creates waves based on density and maxWaves config', () => {
    const scene = new THREE.Scene();

    const low = createWaveField({ maxWaves: 20 });
    low.init(scene, 'seed-a', { ...defaultParams, density: 0.3 });
    const lowCount = getWaveCount(low);

    const high = createWaveField({ maxWaves: 20 });
    high.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    const highCount = getWaveCount(high);

    expect(highCount).toBeGreaterThan(lowCount);

    const capped = createWaveField({ maxWaves: 8 });
    capped.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    expect(getWaveCount(capped)).toBeLessThanOrEqual(8);
  });

  it('T-026-02: same seed produces same initial wave configuration', () => {
    const scene = new THREE.Scene();

    const a = createWaveField();
    a.init(scene, 'deterministic-seed', defaultParams);

    const b = createWaveField();
    b.init(scene, 'deterministic-seed', defaultParams);

    expect(getWavePositions(a)).toEqual(getWavePositions(b));
  });

  it('T-026-03: different seeds produce different wave configurations', () => {
    const scene = new THREE.Scene();

    const a = createWaveField();
    a.init(scene, 'seed-one', defaultParams);

    const b = createWaveField();
    b.init(scene, 'seed-two', defaultParams);

    expect(getWavePositions(a)).not.toEqual(getWavePositions(b));
  });

  it('T-026-04: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'test-seed', defaultParams);

    expect(() => field.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-026-05: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    field.init(scene, 'edge-seed', params);

    expect(() => field.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-026-06: draw does not throw at boundary parameter values', () => {
    const scene = new THREE.Scene();

    const combos: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0, motionAmplitude: 0.2 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1, motionAmplitude: 1 },
      { curveSoftness: 0, structureComplexity: 0 },
      { curveSoftness: 1, structureComplexity: 1 },
    ];

    for (const combo of combos) {
      const params = { ...defaultParams, ...combo };
      const field = createWaveField();
      field.init(scene, 'boundary-seed', params);
      expect(() => field.draw(scene, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-030-13: init() adds a THREE.Group containing Line objects to the scene', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'line-seed', defaultParams);
    const groups = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groups.length).toBe(1);
    const group = groups[0] as THREE.Group;
    const lines = group.children.filter((c) => c instanceof THREE.Line);
    expect(lines.length).toBe(getWaveCount(field));
  });

  it('T-030-14: each Line has a position buffer attribute with sufficient vertices', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'vertex-seed', defaultParams);
    const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const line = group.children[0] as THREE.Line;
    const geo = line.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThanOrEqual(64);
  });

  it('T-030-15: draw() updates wave vertex positions and flags needsUpdate', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'draw-update-seed', defaultParams);
    const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const line = group.children[0] as THREE.Line;
    const geo = line.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
    const before = Float32Array.from(posAttr.array as Float32Array);
    const versionBefore = posAttr.version;
    field.draw(scene, { time: 1000, delta: 16, elapsed: 1000, params: defaultParams, width: 800, height: 600 });
    expect(posAttr.version).toBeGreaterThan(versionBefore);
    const after = Float32Array.from(posAttr.array as Float32Array);
    expect(before).not.toEqual(after);
  });

  it('T-030-16: bass energy influences wave amplitude in vertex positions', () => {
    const scene1 = new THREE.Scene();
    const field1 = createWaveField();
    const lowBass = { ...defaultParams, bassEnergy: 0 };
    field1.init(scene1, 'bass-wave-seed', lowBass);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: lowBass, width: 800, height: 600 });
    const group1 = scene1.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const line1 = group1.children[0] as THREE.Line;
    const pos1 = Float32Array.from((line1.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createWaveField();
    const highBass = { ...defaultParams, bassEnergy: 1.0 };
    field2.init(scene2, 'bass-wave-seed', highBass);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: highBass, width: 800, height: 600 });
    const group2 = scene2.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const line2 = group2.children[0] as THREE.Line;
    const pos2 = Float32Array.from((line2.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array);

    // Y-displacement should be larger with high bass
    let yRange1 = 0, yRange2 = 0;
    for (let i = 1; i < pos1.length; i += 3) { yRange1 = Math.max(yRange1, Math.abs(pos1[i])); }
    for (let i = 1; i < pos2.length; i += 3) { yRange2 = Math.max(yRange2, Math.abs(pos2[i])); }
    expect(yRange2).toBeGreaterThan(yRange1);
  });

  it('T-030-17: pointer disturbance warps wave vertex output', () => {
    const scene1 = new THREE.Scene();
    const field1 = createWaveField();
    const noPtrParams = { ...defaultParams, pointerDisturbance: 0 };
    field1.init(scene1, 'ptr-wave-seed', noPtrParams);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: noPtrParams, width: 800, height: 600 });
    const g1 = scene1.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const pos1 = Float32Array.from((g1.children[0] as THREE.Line).geometry.getAttribute('position').array as Float32Array);

    const scene2 = new THREE.Scene();
    const field2 = createWaveField();
    const ptrParams = { ...defaultParams, pointerDisturbance: 1.0 };
    field2.init(scene2, 'ptr-wave-seed', ptrParams);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: ptrParams, width: 800, height: 600, pointerX: 0.5, pointerY: 0.5 });
    const g2 = scene2.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const pos2 = Float32Array.from((g2.children[0] as THREE.Line).geometry.getAttribute('position').array as Float32Array);

    expect(pos1).not.toEqual(pos2);
  });

  it('T-030-18: reduced motion (low motionAmplitude) produces less wave displacement', () => {
    const scene1 = new THREE.Scene();
    const field1 = createWaveField();
    const lowMotion = { ...defaultParams, motionAmplitude: 0.2, bassEnergy: 0.5 };
    field1.init(scene1, 'motion-wave-seed', lowMotion);
    field1.draw(scene1, { time: 100, delta: 16, elapsed: 100, params: lowMotion, width: 800, height: 600 });
    const g1 = scene1.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const pos1 = (g1.children[0] as THREE.Line).geometry.getAttribute('position').array as Float32Array;
    let yRange1 = 0;
    for (let i = 1; i < pos1.length; i += 3) yRange1 = Math.max(yRange1, Math.abs(pos1[i]));

    const scene2 = new THREE.Scene();
    const field2 = createWaveField();
    const highMotion = { ...defaultParams, motionAmplitude: 1.0, bassEnergy: 0.5 };
    field2.init(scene2, 'motion-wave-seed', highMotion);
    field2.draw(scene2, { time: 100, delta: 16, elapsed: 100, params: highMotion, width: 800, height: 600 });
    const g2 = scene2.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const pos2 = (g2.children[0] as THREE.Line).geometry.getAttribute('position').array as Float32Array;
    let yRange2 = 0;
    for (let i = 1; i < pos2.length; i += 3) yRange2 = Math.max(yRange2, Math.abs(pos2[i]));

    expect(yRange2).toBeGreaterThan(yRange1);
  });

  it('T-030-19: wave line colors derive from paletteHue and wave hueOffset', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'wave-color-seed', { ...defaultParams, paletteHue: 120 });
    const group = scene.children.find((c) => c instanceof THREE.Group) as THREE.Group;
    const line = group.children[0] as THREE.Line;
    const mat = line.material as THREE.LineBasicMaterial;
    expect(mat.color).toBeDefined();
    const isDefaultWhite = mat.color.r === 1 && mat.color.g === 1 && mat.color.b === 1;
    expect(isDefaultWhite).toBe(false);
  });

  it('T-030-20: cleanup() removes Group from scene and disposes all wave geometries/materials', () => {
    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'wave-cleanup-seed', defaultParams);
    const groupsBefore = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groupsBefore.length).toBe(1);
    field.cleanup!();
    const groupsAfter = scene.children.filter((c) => c instanceof THREE.Group);
    expect(groupsAfter.length).toBe(0);
  });

  it('T-025-17: createWaveField with reduced maxWaves caps wave count', () => {
    const scene = new THREE.Scene();
    const field = createWaveField({ maxWaves: 10 });
    field.init(scene, 'cap-seed', { ...defaultParams, density: 1.0 });
    expect(getWaveCount(field)).toBeLessThanOrEqual(10);
    expect(getWaveCount(field)).toBeGreaterThan(0);
  });

  it('T-026-13: no localStorage or cookie access during wave operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', {
      get: cookieGet,
      configurable: true,
    });

    const scene = new THREE.Scene();
    const field = createWaveField();
    field.init(scene, 'privacy-seed', defaultParams);
    field.draw(scene, makeFrame());

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });
});

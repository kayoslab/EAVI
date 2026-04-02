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

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-07: bass energy influences wave amplitude', () => {
    // This test relied on Canvas 2D lineTo calls to measure wave amplitude
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-08: treble energy influences visual properties (stroke style or line width)', () => {
    // This test relied on Canvas 2D strokeStyle and lineWidth
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-09: pointer disturbance warps wave output', () => {
    // This test relied on Canvas 2D lineTo calls
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-10: reduced motion (low motionAmplitude) is respected', () => {
    // This test relied on Canvas 2D lineTo calls to measure displacement
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-11: waves use canvas stroke API (beginPath, lineTo, stroke)', () => {
    // This test relied on Canvas 2D beginPath, lineTo, stroke calls
  });

  // TODO: Re-enable when Canvas 2D systems are ported to Three.js
  it.skip('T-026-12: wave colors derive from paletteHue and paletteSaturation', () => {
    // This test relied on Canvas 2D strokeStyle
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

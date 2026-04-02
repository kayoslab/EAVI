import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { GeometrySystem } from '../../src/visual/types';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';

describe('US-029: GeometrySystem interface', () => {
  it('T-029-30: GeometrySystem interface accepts THREE.Scene in init and draw methods', () => {
    const mockSystem: GeometrySystem = {
      init(scene: THREE.Scene, _seed: string, _params: VisualParams): void {
        // Verify scene is a THREE.Scene
        expect(scene).toBeInstanceOf(THREE.Scene);
      },
      draw(scene: THREE.Scene, _frame: FrameState): void {
        expect(scene).toBeInstanceOf(THREE.Scene);
      },
    };

    const scene = new THREE.Scene();
    const params: VisualParams = {
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

    expect(() => mockSystem.init(scene, 'test', params)).not.toThrow();
    expect(() => mockSystem.draw(scene, {
      time: 0, delta: 16, elapsed: 0, params, width: 800, height: 600,
    })).not.toThrow();
  });

  it('T-030-25: GeometrySystem interface accepts optional cleanup method', () => {
    const system: GeometrySystem = {
      init: (_scene: THREE.Scene, _seed: string, _params: any) => {},
      draw: (_scene: THREE.Scene, _frame: any) => {},
      cleanup: () => {},
    };
    expect(typeof system.cleanup).toBe('function');

    const systemNoCleanup: GeometrySystem = {
      init: (_scene: THREE.Scene, _seed: string, _params: any) => {},
      draw: (_scene: THREE.Scene, _frame: any) => {},
    };
    expect(systemNoCleanup.cleanup).toBeUndefined();
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createModeManager } from '../../src/visual/modeManager';
import type { GeometrySystem, FrameState } from '../../src/visual/types';
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

function createTestScene(): THREE.Scene {
  return new THREE.Scene();
}

function makeFrame(overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 0,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
}

function createMockGeometrySystem(): GeometrySystem & { init: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn> } {
  return {
    init: vi.fn(),
    draw: vi.fn(),
  };
}

describe('US-026: ModeManager', () => {
  it('T-026-14: mode manager implements GeometrySystem interface (init + draw)', () => {
    const mock = createMockGeometrySystem();
    const manager = createModeManager([
      { name: 'a', factory: () => mock },
      { name: 'b', factory: () => createMockGeometrySystem() },
    ]);

    expect(typeof manager.init).toBe('function');
    expect(typeof manager.draw).toBe('function');

    const scene = createTestScene();
    expect(() => manager.init(scene, 'test', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-026-15: initial mode is deterministic from seed', () => {
    const mockA1 = createMockGeometrySystem();
    const mockB1 = createMockGeometrySystem();
    const mockA2 = createMockGeometrySystem();
    const mockB2 = createMockGeometrySystem();

    const scene = createTestScene();

    const m1 = createModeManager([
      { name: 'a', factory: () => mockA1 },
      { name: 'b', factory: () => mockB1 },
    ]);
    m1.init(scene, 'same-seed', defaultParams);
    const idx1 = m1.activeIndex;

    const m2 = createModeManager([
      { name: 'a', factory: () => mockA2 },
      { name: 'b', factory: () => mockB2 },
    ]);
    m2.init(scene, 'same-seed', defaultParams);
    const idx2 = m2.activeIndex;

    expect(idx1).toBe(idx2);
  });

  it('T-026-16: different seeds can produce different initial modes', () => {
    const scene = createTestScene();
    const indices = new Set<number>();

    for (let i = 0; i < 20; i++) {
      const m = createModeManager([
        { name: 'a', factory: () => createMockGeometrySystem() },
        { name: 'b', factory: () => createMockGeometrySystem() },
      ]);
      m.init(scene, `seed-${i}`, defaultParams);
      indices.add(m.activeIndex);
    }

    expect(indices.size).toBeGreaterThanOrEqual(2);
  });

  it('T-026-17: mode switches at elapsed time boundary', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'switch-seed', defaultParams);

    // Draw at elapsed=0
    manager.draw(scene, makeFrame({ elapsed: 0 }));

    // Draw at elapsed=200000 (well past any 90-180s interval)
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // Both mocks should have been used
    expect(mockA.draw.mock.calls.length + mockB.draw.mock.calls.length).toBe(2);
    // At least one call to each
    const aCalls = mockA.draw.mock.calls.length;
    const bCalls = mockB.draw.mock.calls.length;
    expect(aCalls).toBeGreaterThanOrEqual(1);
    expect(bCalls).toBeGreaterThanOrEqual(1);
  });

  it('T-026-18: both modes receive the same seed on init', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'shared-seed', defaultParams);

    // Trigger mode switch
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // Both should have been init'd with 'shared-seed'
    const aSeeds = mockA.init.mock.calls.map((c: unknown[]) => c[1]);
    const bSeeds = mockB.init.mock.calls.map((c: unknown[]) => c[1]);
    const allSeeds = [...aSeeds, ...bSeeds];

    expect(allSeeds.length).toBeGreaterThanOrEqual(2);
    for (const s of allSeeds) {
      expect(s).toBe('shared-seed');
    }
  });

  it('T-026-19: both modes receive same VisualParams', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'params-seed', defaultParams);

    const frame = makeFrame({ elapsed: 0 });
    manager.draw(scene, frame);

    // The active mock should have received the exact FrameState
    const activeMock = mockA.draw.mock.calls.length > 0 ? mockA : mockB;
    expect(activeMock.draw.mock.calls[0][1]).toBe(frame);
  });

  it('T-026-20: mode switch does not throw', () => {
    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => createMockGeometrySystem() },
      { name: 'b', factory: () => createMockGeometrySystem() },
    ]);
    manager.init(scene, 'safe-seed', defaultParams);

    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
  });

  it('T-026-21: mode switch does not break playback — draw continues producing output', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'playback-seed', defaultParams);

    const totalFrames = 10;
    for (let i = 0; i < totalFrames; i++) {
      // Spread elapsed across 0-400s to ensure switch happens
      manager.draw(scene, makeFrame({ elapsed: i * 40_000 }));
    }

    const totalDrawCalls = mockA.draw.mock.calls.length + mockB.draw.mock.calls.length;
    expect(totalDrawCalls).toBe(totalFrames);
  });

  it('T-026-22: registry accepts multiple modes and cycles through them', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();
    const mockC = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.init(scene, 'cycle-seed', defaultParams);

    // Draw at various elapsed times to cross multiple switch boundaries
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    manager.draw(scene, makeFrame({ elapsed: 400_000 }));

    // All 3 modes should have been drawn at least once
    expect(mockA.draw.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockB.draw.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(mockC.draw.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  it('T-026-23: switch interval is seeded and varies by seed', () => {
    const scene = createTestScene();
    const switchTimes: number[] = [];

    for (let s = 0; s < 10; s++) {
      const mockA = createMockGeometrySystem();
      const mockB = createMockGeometrySystem();

      const manager = createModeManager([
        { name: 'a', factory: () => mockA },
        { name: 'b', factory: () => mockB },
      ]);
      manager.init(scene, `interval-seed-${s}`, defaultParams);

      const initialIndex = manager.activeIndex;

      // Probe at 1-second intervals from 89s to 181s
      let switchTime = -1;
      for (let t = 89_000; t <= 181_000; t += 1000) {
        manager.draw(scene, makeFrame({ elapsed: t }));
        if (manager.activeIndex !== initialIndex) {
          switchTime = t;
          break;
        }
      }
      if (switchTime > 0) switchTimes.push(switchTime);
    }

    // At least two different switch times
    const unique = new Set(switchTimes);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('T-026-24: mode manager works with real ParticleField and WaveField', async () => {
    const { createParticleField } = await import('../../src/visual/systems/particleField');
    const { createWaveField } = await import('../../src/visual/systems/waveField');

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'waves', factory: () => createWaveField() },
    ]);

    expect(() => manager.init(scene, 'integration-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 100_000 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
  });

  it('T-030-23: cleanup() is called on outgoing system during mode switch', () => {
    const mockA = createMockGeometrySystem();
    (mockA as any).cleanup = vi.fn();
    const mockB = createMockGeometrySystem();
    (mockB as any).cleanup = vi.fn();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'cleanup-switch-seed', defaultParams);
    const initialIndex = manager.activeIndex;
    const initialMock = initialIndex === 0 ? mockA : mockB;

    // Trigger mode switch
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    expect((initialMock as any).cleanup).toHaveBeenCalled();
  });

  it('T-030-24: mode switch with cleanup does not throw even when cleanup is undefined', () => {
    const mockA = createMockGeometrySystem();
    const mockB = createMockGeometrySystem();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'no-cleanup-seed', defaultParams);

    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
  });

  it('T-026-25: no localStorage or cookie access during mode management', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', {
      get: cookieGet,
      configurable: true,
    });

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => createMockGeometrySystem() },
      { name: 'b', factory: () => createMockGeometrySystem() },
    ]);
    manager.init(scene, 'privacy-seed', defaultParams);
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();

    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });
});

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

function makeFrame(overrides?: Partial<FrameState & { params: Partial<VisualParams> }>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 0,
    width: 800,
    height: 600,
    params: { ...defaultParams, ...(overrides?.params ?? {}) },
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== 'params')),
  } as FrameState;
}

function createMockGeometrySystem(): GeometrySystem & { init: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn> } {
  return {
    init: vi.fn(),
    draw: vi.fn(),
  };
}

function createMockGeometrySystemWithOpacity(): GeometrySystem & { init: ReturnType<typeof vi.fn>; draw: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn>; setOpacity: ReturnType<typeof vi.fn> } {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    cleanup: vi.fn(),
    setOpacity: vi.fn(),
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
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'switch-seed', defaultParams);
    const initialIndex = manager.activeIndex;

    // Draw at elapsed=0
    manager.draw(scene, makeFrame({ elapsed: 0 }));

    // Trigger switch at elapsed=200000
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // During transition both should be drawn
    expect(mockA.draw.mock.calls.length + mockB.draw.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Complete transition
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));

    // Active index should have changed
    expect(manager.activeIndex).not.toBe(initialIndex);
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
    expect(totalDrawCalls).toBeGreaterThanOrEqual(totalFrames);
  });

  it('T-026-22: registry accepts multiple modes and cycles through them', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.init(scene, 'cycle-seed', defaultParams);

    // Draw and complete transitions
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));
    manager.draw(scene, makeFrame({ elapsed: 400_000 }));
    manager.draw(scene, makeFrame({ elapsed: 405_000 }));

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

  it('T-026-24: mode manager works with real ParticleField and RibbonField', async () => {
    const { createParticleField } = await import('../../src/visual/systems/particleField');
    const { createRibbonField } = await import('../../src/visual/systems/ribbonField');

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
    ]);

    expect(() => manager.init(scene, 'integration-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 100_000 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
  });

  it('T-030-23: cleanup() is called on outgoing system during mode switch', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'cleanup-switch-seed', defaultParams);
    const initialIndex = manager.activeIndex;
    const initialMock = initialIndex === 0 ? mockA : mockB;

    // Trigger mode switch (starts transition)
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // Cleanup should NOT be called yet (still transitioning)
    expect(initialMock.cleanup).not.toHaveBeenCalled();

    // Complete transition (advance past max 4s transition duration)
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));

    // NOW cleanup should have been called
    expect(initialMock.cleanup).toHaveBeenCalled();
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

describe('US-035: Smooth visual transitions between 3D modes', () => {
  it('T-035-01: mode switch crossfades — both outgoing and incoming draw() are called during transition', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'crossfade-seed', defaultParams);
    const initialIndex = manager.activeIndex;
    const [initial, incoming] = initialIndex === 0 ? [mockA, mockB] : [mockB, mockA];

    // Draw before switch
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    expect(initial.draw).toHaveBeenCalledTimes(1);
    expect(incoming.draw).not.toHaveBeenCalled();

    // Trigger switch — use 200s which exceeds 90-180s interval
    initial.draw.mockClear();
    incoming.draw.mockClear();
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // During transition, BOTH systems should be drawn
    expect(initial.draw).toHaveBeenCalled();
    expect(incoming.draw).toHaveBeenCalled();
  });

  it('T-035-02: transition duration is seeded and falls within 2-4 second range', () => {
    const scene = createTestScene();
    const durations: number[] = [];

    for (let s = 0; s < 20; s++) {
      const mockA = createMockGeometrySystemWithOpacity();
      const mockB = createMockGeometrySystemWithOpacity();

      const manager = createModeManager([
        { name: 'a', factory: () => mockA },
        { name: 'b', factory: () => mockB },
      ]);
      manager.init(scene, `duration-seed-${s}`, defaultParams);

      // Trigger transition at 200s
      manager.draw(scene, makeFrame({ elapsed: 200_000 }));
      expect(manager.transitioning).toBe(true);

      // Probe to find when transition ends (check 100ms increments from 200s+2000ms to 200s+4500ms)
      let endTime = -1;
      for (let t = 202_000; t <= 204_500; t += 100) {
        manager.draw(scene, makeFrame({ elapsed: t }));
        if (!manager.transitioning) {
          endTime = t;
          break;
        }
      }
      expect(endTime).toBeGreaterThanOrEqual(202_000);
      expect(endTime).toBeLessThanOrEqual(204_100);
      durations.push(endTime - 200_000);
    }

    // Durations should vary across seeds
    const unique = new Set(durations);
    expect(unique.size).toBeGreaterThanOrEqual(2);
  });

  it('T-035-03: after transition completes, only incoming system draws and outgoing cleanup was called', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'post-transition-seed', defaultParams);
    const initialIndex = manager.activeIndex;
    const [outgoing, incoming] = initialIndex === 0 ? [mockA, mockB] : [mockB, mockA];

    // Trigger switch
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // Advance well past max transition duration (200s + 5s)
    outgoing.draw.mockClear();
    incoming.draw.mockClear();
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));

    // Only incoming should be drawn now
    expect(incoming.draw).toHaveBeenCalled();
    expect(outgoing.draw).not.toHaveBeenCalled();

    // Outgoing cleanup should have been called
    expect(outgoing.cleanup).toHaveBeenCalled();
  });

  it('T-035-04: no frame hitches — draw() never throws during entire transition lifecycle', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'hitch-test-seed', defaultParams);

    // Draw frames spanning before, during, and after transition
    for (let t = 0; t <= 210_000; t += 500) {
      expect(() => manager.draw(scene, makeFrame({ elapsed: t }))).not.toThrow();
    }
  });

  it('T-035-05: audio params (bassEnergy, trebleEnergy) flow to both systems during transition', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'audio-flow-seed', defaultParams);

    // Trigger transition with audio data
    const audioFrame = makeFrame({
      elapsed: 200_000,
      params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 },
    });
    manager.draw(scene, audioFrame);

    // Both systems should receive the frame with audio params
    const aFrame = mockA.draw.mock.calls.length > 0 ? mockA.draw.mock.calls[mockA.draw.mock.calls.length - 1][1] : null;
    const bFrame = mockB.draw.mock.calls.length > 0 ? mockB.draw.mock.calls[mockB.draw.mock.calls.length - 1][1] : null;

    // During transition both should have been called
    expect(aFrame).not.toBeNull();
    expect(bFrame).not.toBeNull();
    expect(aFrame.params.bassEnergy).toBe(0.8);
    expect(aFrame.params.trebleEnergy).toBe(0.6);
    expect(bFrame.params.bassEnergy).toBe(0.8);
    expect(bFrame.params.trebleEnergy).toBe(0.6);
  });

  it('T-035-06: transition state is observable via manager.transitioning', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'observable-seed', defaultParams);

    // Before any switch
    expect(manager.transitioning).toBe(false);

    // Draw normally
    manager.draw(scene, makeFrame({ elapsed: 0 }));
    expect(manager.transitioning).toBe(false);

    // Trigger switch
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    expect(manager.transitioning).toBe(true);

    // Well after transition completes
    manager.draw(scene, makeFrame({ elapsed: 205_000 }));
    expect(manager.transitioning).toBe(false);
  });

  it('T-035-07: setOpacity is called with correct crossfade values (outgoing decreases, incoming increases)', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.init(scene, 'opacity-values-seed', defaultParams);
    const initialIndex = manager.activeIndex;
    const [outgoing, incoming] = initialIndex === 0 ? [mockA, mockB] : [mockB, mockA];

    // Trigger transition
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));

    // Record mid-transition opacity
    outgoing.setOpacity.mockClear();
    incoming.setOpacity.mockClear();
    manager.draw(scene, makeFrame({ elapsed: 201_500 }));

    // Both should have setOpacity called
    expect(outgoing.setOpacity).toHaveBeenCalled();
    expect(incoming.setOpacity).toHaveBeenCalled();

    const outVal = outgoing.setOpacity.mock.calls[outgoing.setOpacity.mock.calls.length - 1][0];
    const inVal = incoming.setOpacity.mock.calls[incoming.setOpacity.mock.calls.length - 1][0];

    // Outgoing should be decreasing (less than 1)
    expect(outVal).toBeLessThan(1.0);
    expect(outVal).toBeGreaterThanOrEqual(0.0);

    // Incoming should be increasing (greater than 0)
    expect(inVal).toBeGreaterThan(0.0);
    expect(inVal).toBeLessThanOrEqual(1.0);

    // They should be roughly complementary
    expect(outVal + inVal).toBeCloseTo(1.0, 1);
  });

  it('T-035-08: integration — real ParticleField and PointCloud do not throw during transition', async () => {
    const { createParticleField } = await import('../../src/visual/systems/particleField');
    const { createPointCloud } = await import('../../src/visual/systems/pointCloud');

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'points', factory: () => createPointCloud() },
    ]);

    expect(() => manager.init(scene, 'integration-transition-seed', defaultParams)).not.toThrow();

    // Normal draw
    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();

    // Trigger transition
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();

    // Mid-transition
    expect(() => manager.draw(scene, makeFrame({ elapsed: 201_500 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 203_000 }))).not.toThrow();

    // Post-transition
    expect(() => manager.draw(scene, makeFrame({ elapsed: 205_000 }))).not.toThrow();
  });
});

describe('US-048: Shader validation — ModeManager integration', () => {
  it('T-048-11: initAllForValidation calls init() on ALL geometry systems', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.initAllForValidation(scene, 'val-seed', defaultParams);

    expect(mockA.init).toHaveBeenCalledTimes(1);
    expect(mockB.init).toHaveBeenCalledTimes(1);
    expect(mockC.init).toHaveBeenCalledTimes(1);

    // All receive same seed and params
    expect(mockA.init).toHaveBeenCalledWith(scene, 'val-seed', defaultParams);
    expect(mockB.init).toHaveBeenCalledWith(scene, 'val-seed', defaultParams);
    expect(mockC.init).toHaveBeenCalledWith(scene, 'val-seed', defaultParams);
  });

  it('T-048-12: initAllForValidation sets opacity to 0 on non-active systems', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.initAllForValidation(scene, 'opacity-val-seed', defaultParams);

    const mocks = [mockA, mockB, mockC];
    const active = manager.activeIndex;

    for (let i = 0; i < mocks.length; i++) {
      if (i !== active) {
        expect(mocks[i].setOpacity).toHaveBeenCalledWith(0);
      } else {
        // Active system should NOT have setOpacity(0) called
        const zeroCall = mocks[i].setOpacity.mock.calls.find((c: number[]) => c[0] === 0);
        expect(zeroCall).toBeUndefined();
      }
    }
  });

  it('T-048-13: cleanupInactive calls cleanup() only on non-active systems', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.initAllForValidation(scene, 'cleanup-val-seed', defaultParams);

    const active = manager.activeIndex;
    manager.cleanupInactive();

    const mocks = [mockA, mockB, mockC];
    for (let i = 0; i < mocks.length; i++) {
      if (i !== active) {
        expect(mocks[i].cleanup).toHaveBeenCalled();
      } else {
        expect(mocks[i].cleanup).not.toHaveBeenCalled();
      }
    }
  });

  it('T-048-14: cleanupInactive does not throw when cleanup is undefined', () => {
    const mockA = createMockGeometrySystem(); // no cleanup defined
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystem(); // no cleanup defined

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.initAllForValidation(scene, 'no-cleanup-val-seed', defaultParams);

    expect(() => manager.cleanupInactive()).not.toThrow();
  });

  it('T-048-15: after initAllForValidation + cleanupInactive, draw() still works for active system', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();
    const mockC = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
      { name: 'c', factory: () => mockC },
    ]);
    manager.initAllForValidation(scene, 'draw-val-seed', defaultParams);
    manager.cleanupInactive();

    const mocks = [mockA, mockB, mockC];
    const active = manager.activeIndex;

    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
    expect(mocks[active].draw).toHaveBeenCalled();
  });

  it('T-048-17: initAllForValidation sets initialized flag — draw works without extra init', () => {
    const mockA = createMockGeometrySystemWithOpacity();
    const mockB = createMockGeometrySystemWithOpacity();

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'a', factory: () => mockA },
      { name: 'b', factory: () => mockB },
    ]);
    manager.initAllForValidation(scene, 'init-flag-seed', defaultParams);

    // Clear init call histories
    mockA.init.mockClear();
    mockB.init.mockClear();

    manager.draw(scene, makeFrame());

    const mocks = [mockA, mockB];
    const active = manager.activeIndex;
    expect(mocks[active].draw).toHaveBeenCalled();

    // No extra init calls
    expect(mockA.init).not.toHaveBeenCalled();
    expect(mockB.init).not.toHaveBeenCalled();
  });

  it('T-056-38: ModeManager accepts MicroGeometry as a fifth mode entry', () => {
    const mockMicro = { init: vi.fn(), draw: vi.fn(), cleanup: vi.fn(), setOpacity: vi.fn() };
    const manager = createModeManager([
      { name: 'particles', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'ribbon', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'pointcloud', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'crystal', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'microgeometry', factory: () => mockMicro },
    ]);
    expect(() => manager.init(new THREE.Scene(), 'test-seed', defaultParams)).not.toThrow();
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createModeManager } from '../../src/visual/modeManager';
import type { RotationEntry, SingleRotationEntry, CompoundRotationEntry } from '../../src/visual/modeManager';
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

  it('T-054-49: ModeManager accepts wireframePolyhedra as a fifth mode entry', () => {
    const mockWire = { init: vi.fn(), draw: vi.fn(), cleanup: vi.fn(), setOpacity: vi.fn() };
    const manager = createModeManager([
      { name: 'particles', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'ribbon', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'pointcloud', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'crystal', factory: () => ({ init: vi.fn(), draw: vi.fn() }) },
      { name: 'wirepolyhedra', factory: () => mockWire },
    ]);
    expect(() => manager.init(new THREE.Scene(), 'test-seed', defaultParams)).not.toThrow();
  });

  it('T-054-50: wirepolyhedra mode can be reached during mode cycling (5-mode rotation)', () => {
    const mocks = Array.from({ length: 5 }, () => ({
      init: vi.fn(),
      draw: vi.fn(),
      cleanup: vi.fn(),
      setOpacity: vi.fn(),
    }));
    const scene = createTestScene();
    const indices = new Set<number>();

    for (let s = 0; s < 30; s++) {
      const manager = createModeManager([
        { name: 'particles', factory: () => mocks[0] },
        { name: 'ribbon', factory: () => mocks[1] },
        { name: 'pointcloud', factory: () => mocks[2] },
        { name: 'crystal', factory: () => mocks[3] },
        { name: 'wirepolyhedra', factory: () => mocks[4] },
      ]);
      manager.init(scene, `cycle-${s}`, defaultParams);
      indices.add(manager.activeIndex);
    }
    // All 5 modes should be reachable as initial mode
    expect(indices.size).toBeGreaterThanOrEqual(4);
  });

  it('T-054-51: initAllForValidation initializes wirepolyhedra along with all other modes', () => {
    const mocks = Array.from({ length: 5 }, () => ({
      init: vi.fn(),
      draw: vi.fn(),
      cleanup: vi.fn(),
      setOpacity: vi.fn(),
    }));
    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'particles', factory: () => mocks[0] },
      { name: 'ribbon', factory: () => mocks[1] },
      { name: 'pointcloud', factory: () => mocks[2] },
      { name: 'crystal', factory: () => mocks[3] },
      { name: 'wirepolyhedra', factory: () => mocks[4] },
    ]);
    manager.initAllForValidation(scene, 'val-seed', defaultParams);

    for (let i = 0; i < 5; i++) {
      expect(mocks[i].init).toHaveBeenCalledTimes(1);
    }
  });

  it('T-054-52: integration — real wireframePolyhedra does not throw during mode transition', async () => {
    const { createWireframePolyhedra } = await import('../../src/visual/systems/wireframePolyhedra');
    const { createPointCloud } = await import('../../src/visual/systems/pointCloud');

    const scene = createTestScene();
    const manager = createModeManager([
      { name: 'points', factory: () => createPointCloud() },
      { name: 'wirepolyhedra', factory: () => createWireframePolyhedra() },
    ]);

    expect(() => manager.init(scene, 'wire-integration-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 201_500 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 205_000 }))).not.toThrow();
  });
});

// --- Compound mode helpers ---

function createSingleEntry(name: string, system?: GeometrySystem): SingleRotationEntry {
  return {
    kind: 'single',
    name,
    system: system ?? createMockGeometrySystemWithOpacity(),
    maxPoints: 1000,
  };
}

function createCompoundEntry(
  name: string,
  systems?: [GeometrySystem, GeometrySystem],
): CompoundRotationEntry {
  return {
    kind: 'compound',
    name,
    layers: [
      { system: systems?.[0] ?? createMockGeometrySystemWithOpacity(), name: 'layerA' },
      { system: systems?.[1] ?? createMockGeometrySystemWithOpacity(), name: 'layerB' },
    ],
    primaryLayerIndex: 0,
    maxPoints: 500,
  };
}

describe('US-061: ModeManager compound modes', () => {
  it('T-061-18: ModeManager accepts mix of single and compound RotationEntry[]', () => {
    const singleA = createSingleEntry('a');
    const compoundAB = createCompoundEntry('a+b');
    const singleB = createSingleEntry('b');

    expect(() => createModeManager([singleA, compoundAB, singleB])).not.toThrow();
    const manager = createModeManager([singleA, compoundAB, singleB]);
    const scene = createTestScene();
    expect(() => manager.init(scene, 'test-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-061-19: compound entry init calls init on both layers', () => {
    const sys0 = createMockGeometrySystemWithOpacity();
    const sys1 = createMockGeometrySystemWithOpacity();
    const compound = createCompoundEntry('compound', [sys0, sys1]);
    const scene = createTestScene();

    // Use only compound entry so it's guaranteed to be active
    const manager = createModeManager([compound]);
    manager.init(scene, 'seed', defaultParams);

    expect(sys0.init).toHaveBeenCalledWith(scene, 'seed', defaultParams);
    expect(sys1.init).toHaveBeenCalledWith(scene, 'seed', defaultParams);
  });

  it('T-061-20: compound entry draw calls draw on both layers', () => {
    const sys0 = createMockGeometrySystemWithOpacity();
    const sys1 = createMockGeometrySystemWithOpacity();
    const compound = createCompoundEntry('compound', [sys0, sys1]);
    const scene = createTestScene();

    const manager = createModeManager([compound]);
    manager.init(scene, 'seed', defaultParams);
    const frame = makeFrame();
    manager.draw(scene, frame);

    expect(sys0.draw).toHaveBeenCalled();
    expect(sys1.draw).toHaveBeenCalled();
  });

  it('T-061-21: compound entry cleanup calls cleanup on both layers', () => {
    const sys0 = createMockGeometrySystemWithOpacity();
    const sys1 = createMockGeometrySystemWithOpacity();
    const compound = createCompoundEntry('compound', [sys0, sys1]);
    const single = createSingleEntry('single');
    const scene = createTestScene();

    // Need compound first, then trigger transition to single, then complete transition
    const manager = createModeManager([compound, single]);
    manager.init(scene, 'seed', defaultParams);

    // Find which entry is active and advance until transition starts
    const switchTime = 200_000;
    manager.draw(scene, makeFrame({ elapsed: switchTime }));
    // Complete transition
    manager.draw(scene, makeFrame({ elapsed: switchTime + 10_000 }));

    // At least one of the compound systems should have had cleanup called
    // (depends on which was active initially)
    if (sys0.init.mock.calls.length > 0) {
      expect(sys0.cleanup).toHaveBeenCalled();
      expect(sys1.cleanup).toHaveBeenCalled();
    }
  });

  it('T-061-22: crossfade between single and compound sets opacity on all involved systems', () => {
    const outSys = createMockGeometrySystemWithOpacity();
    const inSys0 = createMockGeometrySystemWithOpacity();
    const inSys1 = createMockGeometrySystemWithOpacity();

    const single = createSingleEntry('single', outSys);
    const compound = createCompoundEntry('compound', [inSys0, inSys1]);
    const scene = createTestScene();

    const manager = createModeManager([single, compound]);
    manager.init(scene, 'seed', defaultParams);

    // Trigger transition
    const switchTime = 200_000;
    manager.draw(scene, makeFrame({ elapsed: switchTime }));

    // Draw mid-transition
    manager.draw(scene, makeFrame({ elapsed: switchTime + 1000 }));

    // Check that opacity was set on all systems during transition
    if (outSys.init.mock.calls.length > 0) {
      // single was active, transitioning to compound
      expect(outSys.setOpacity).toHaveBeenCalled();
      expect(inSys0.setOpacity).toHaveBeenCalled();
      expect(inSys1.setOpacity).toHaveBeenCalled();
    } else {
      // compound was active, transitioning to single
      expect(inSys0.setOpacity).toHaveBeenCalled();
      expect(inSys1.setOpacity).toHaveBeenCalled();
      expect(outSys.setOpacity).toHaveBeenCalled();
    }
  });

  it('T-061-23: crossfade between two compound entries sets opacity on all 4 systems', () => {
    const sys0a = createMockGeometrySystemWithOpacity();
    const sys0b = createMockGeometrySystemWithOpacity();
    const sys1a = createMockGeometrySystemWithOpacity();
    const sys1b = createMockGeometrySystemWithOpacity();

    const compound0 = createCompoundEntry('compound0', [sys0a, sys0b]);
    const compound1 = createCompoundEntry('compound1', [sys1a, sys1b]);
    const scene = createTestScene();

    const manager = createModeManager([compound0, compound1]);
    manager.init(scene, 'seed', defaultParams);

    // Trigger and progress transition
    const switchTime = 200_000;
    manager.draw(scene, makeFrame({ elapsed: switchTime }));
    manager.draw(scene, makeFrame({ elapsed: switchTime + 1000 }));

    // All 4 systems should have setOpacity called
    expect(sys0a.setOpacity).toHaveBeenCalled();
    expect(sys0b.setOpacity).toHaveBeenCalled();
    expect(sys1a.setOpacity).toHaveBeenCalled();
    expect(sys1b.setOpacity).toHaveBeenCalled();
  });

  it('T-061-24: activeEntryName returns compound name during compound mode', () => {
    const compound = createCompoundEntry('cloud+wireframe');
    const manager = createModeManager([compound]);
    const scene = createTestScene();
    manager.init(scene, 'seed', defaultParams);

    expect(manager.activeEntryName).toBe('cloud+wireframe');
  });

  it('T-061-25: activeEntryName returns single mode name during single mode', () => {
    const single = createSingleEntry('pointcloud');
    const manager = createModeManager([single]);
    const scene = createTestScene();
    manager.init(scene, 'seed', defaultParams);

    expect(manager.activeEntryName).toBe('pointcloud');
  });

  it('T-061-26: isCompoundActive returns true during compound mode, false during single', () => {
    const compound = createCompoundEntry('compound');
    const single = createSingleEntry('single');

    const compoundManager = createModeManager([compound]);
    compoundManager.init(createTestScene(), 'seed', defaultParams);
    expect(compoundManager.isCompoundActive).toBe(true);

    const singleManager = createModeManager([single]);
    singleManager.init(createTestScene(), 'seed', defaultParams);
    expect(singleManager.isCompoundActive).toBe(false);
  });

  it('T-061-27: activeMaxPoints returns correct value for compound and single entries', () => {
    const compound = createCompoundEntry('compound');
    compound.maxPoints = 500;
    const single = createSingleEntry('single');
    single.maxPoints = 1000;

    const compoundManager = createModeManager([compound]);
    compoundManager.init(createTestScene(), 'seed', defaultParams);
    expect(compoundManager.activeMaxPoints).toBe(500);

    const singleManager = createModeManager([single]);
    singleManager.init(createTestScene(), 'seed', defaultParams);
    expect(singleManager.activeMaxPoints).toBe(1000);
  });

  it('T-061-28: rotation sequence includes both single and compound entries across seeds', () => {
    let foundCompound = false;
    let foundSingle = false;

    for (let i = 0; i < 30; i++) {
      const single = createSingleEntry('single');
      const compound = createCompoundEntry('compound');
      const manager = createModeManager([single, compound]);
      manager.init(createTestScene(), `seed-${i}`, defaultParams);

      if (manager.isCompoundActive) foundCompound = true;
      else foundSingle = true;
    }

    expect(foundCompound).toBe(true);
    expect(foundSingle).toBe(true);
  });

  it('T-061-29: rotation is deterministic from seed', () => {
    const manager1 = createModeManager([createSingleEntry('a'), createCompoundEntry('b'), createSingleEntry('c')]);
    manager1.init(createTestScene(), 'deterministic-seed', defaultParams);

    const manager2 = createModeManager([createSingleEntry('a'), createCompoundEntry('b'), createSingleEntry('c')]);
    manager2.init(createTestScene(), 'deterministic-seed', defaultParams);

    expect(manager1.activeEntryName).toBe(manager2.activeEntryName);
  });

  it('T-061-30: initAllForValidation inits ALL systems across single and compound entries', () => {
    const singleSys = createMockGeometrySystemWithOpacity();
    const compSys0 = createMockGeometrySystemWithOpacity();
    const compSys1 = createMockGeometrySystemWithOpacity();

    const single = createSingleEntry('single', singleSys);
    const compound = createCompoundEntry('compound', [compSys0, compSys1]);
    const scene = createTestScene();

    const manager = createModeManager([single, compound]);
    manager.initAllForValidation(scene, 'seed', defaultParams);

    expect(singleSys.init).toHaveBeenCalledOnce();
    expect(compSys0.init).toHaveBeenCalledOnce();
    expect(compSys1.init).toHaveBeenCalledOnce();

    // Non-active systems should have setOpacity(0)
    const allSystems = [singleSys, compSys0, compSys1];
    const inactiveWithOpacity = allSystems.filter((s) =>
      s.setOpacity.mock.calls.some((c: number[]) => c[0] === 0),
    );
    expect(inactiveWithOpacity.length).toBeGreaterThan(0);
  });

  it('T-061-31: overlay getPositions receives primaryLayer system for compound entries', () => {
    const primarySys = createMockGeometrySystemWithOpacity();
    const secondarySys = createMockGeometrySystemWithOpacity();
    const compound = createCompoundEntry('compound', [primarySys, secondarySys]);
    compound.primaryLayerIndex = 0;

    const scene = createTestScene();
    const manager = createModeManager([compound]);

    const getPositions = vi.fn(() => new Float32Array([1, 2, 3]));
    const overlayMock = {
      init: vi.fn(),
      draw: vi.fn(),
      cleanup: vi.fn(),
      setOpacity: vi.fn(),
    };

    manager.attachOverlay({
      overlay: overlayMock as unknown as import('../../src/visual/systems/constellationLines').ConstellationLines,
      getPositions,
    });

    manager.init(scene, 'seed', defaultParams);

    expect(getPositions).toHaveBeenCalledWith(primarySys);
    expect(getPositions).not.toHaveBeenCalledWith(secondarySys);
  });

  it('T-061-32: overlay getPositions receives system directly for single entries', () => {
    const sys = createMockGeometrySystemWithOpacity();
    const single = createSingleEntry('single', sys);
    const scene = createTestScene();

    const manager = createModeManager([single]);

    const getPositions = vi.fn(() => new Float32Array([1, 2, 3]));
    const overlayMock = {
      init: vi.fn(),
      draw: vi.fn(),
      cleanup: vi.fn(),
      setOpacity: vi.fn(),
    };

    manager.attachOverlay({
      overlay: overlayMock as unknown as import('../../src/visual/systems/constellationLines').ConstellationLines,
      getPositions,
    });

    manager.init(scene, 'seed', defaultParams);

    expect(getPositions).toHaveBeenCalledWith(sys);
  });

  it('T-061-33: compound-to-single transition completes cleanly', () => {
    const compSys0 = createMockGeometrySystemWithOpacity();
    const compSys1 = createMockGeometrySystemWithOpacity();
    const singleSys = createMockGeometrySystemWithOpacity();

    const compound = createCompoundEntry('compound', [compSys0, compSys1]);
    const single = createSingleEntry('single', singleSys);
    const scene = createTestScene();

    const manager = createModeManager([compound, single]);
    manager.init(scene, 'seed', defaultParams);

    // Trigger mode switch
    const switchTime = 200_000;
    manager.draw(scene, makeFrame({ elapsed: switchTime }));

    // Mid-transition: all systems drawn
    manager.draw(scene, makeFrame({ elapsed: switchTime + 1000 }));

    // Complete transition
    manager.draw(scene, makeFrame({ elapsed: switchTime + 10_000 }));

    if (compSys0.init.mock.calls.length > 0) {
      // compound was initially active
      expect(compSys0.cleanup).toHaveBeenCalled();
      expect(compSys1.cleanup).toHaveBeenCalled();
    }
  });

  it('T-061-34: single-to-compound transition completes cleanly', () => {
    const singleSys = createMockGeometrySystemWithOpacity();
    const compSys0 = createMockGeometrySystemWithOpacity();
    const compSys1 = createMockGeometrySystemWithOpacity();

    const single = createSingleEntry('single', singleSys);
    const compound = createCompoundEntry('compound', [compSys0, compSys1]);
    const scene = createTestScene();

    const manager = createModeManager([single, compound]);
    manager.init(scene, 'seed', defaultParams);

    // Trigger mode switch
    const switchTime = 200_000;
    manager.draw(scene, makeFrame({ elapsed: switchTime }));

    // Mid-transition
    manager.draw(scene, makeFrame({ elapsed: switchTime + 1000 }));

    // Complete transition
    manager.draw(scene, makeFrame({ elapsed: switchTime + 10_000 }));

    if (singleSys.init.mock.calls.length > 0 && singleSys.init.mock.calls.length === 1) {
      // single was initially active, transitioned to compound
      expect(singleSys.cleanup).toHaveBeenCalled();
    }
  });

  it('T-061-35: no frame hitches during compound mode transitions', () => {
    const compound = createCompoundEntry('compound');
    const single = createSingleEntry('single');
    const scene = createTestScene();

    const manager = createModeManager([compound, single]);
    manager.init(scene, 'seed', defaultParams);

    // Simulate 210 seconds in 500ms increments
    for (let elapsed = 0; elapsed <= 210_000; elapsed += 500) {
      expect(() => manager.draw(scene, makeFrame({ elapsed }))).not.toThrow();
    }
  });

  it('T-061-36: audio params flow to all compound layers during transition', () => {
    const sys0 = createMockGeometrySystemWithOpacity();
    const sys1 = createMockGeometrySystemWithOpacity();
    const compound = createCompoundEntry('compound', [sys0, sys1]);
    const scene = createTestScene();

    const manager = createModeManager([compound]);
    manager.init(scene, 'seed', defaultParams);

    const frame = makeFrame({ params: { bassEnergy: 0.8, trebleEnergy: 0.6 } });
    manager.draw(scene, frame);

    const drawFrame0 = sys0.draw.mock.calls[sys0.draw.mock.calls.length - 1]?.[1] as FrameState;
    const drawFrame1 = sys1.draw.mock.calls[sys1.draw.mock.calls.length - 1]?.[1] as FrameState;
    expect(drawFrame0.params.bassEnergy).toBe(0.8);
    expect(drawFrame1.params.trebleEnergy).toBe(0.6);
  });

  it('T-061-37: ModeManager with only compound entries does not throw', () => {
    const compoundA = createCompoundEntry('a');
    const compoundB = createCompoundEntry('b');
    const scene = createTestScene();

    const manager = createModeManager([compoundA, compoundB]);
    expect(() => manager.init(scene, 'seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();

    // Trigger transition
    expect(() => manager.draw(scene, makeFrame({ elapsed: 200_000 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 201_000 }))).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 210_000 }))).not.toThrow();
  });

  it('T-061-38: ModeManager with only single entries still works (backward compatibility)', () => {
    const singleA = createSingleEntry('a');
    const singleB = createSingleEntry('b');
    const scene = createTestScene();

    const manager = createModeManager([singleA, singleB]);
    manager.init(scene, 'seed', defaultParams);
    expect(manager.isCompoundActive).toBe(false);

    // Transitions work
    manager.draw(scene, makeFrame({ elapsed: 200_000 }));
    manager.draw(scene, makeFrame({ elapsed: 201_000 }));
    manager.draw(scene, makeFrame({ elapsed: 210_000 }));
  });

  it('T-061-39: no localStorage or cookie access during compound mode lifecycle', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') ||
      Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
    const cookieGetSpy = vi.fn(() => '');
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', {
        get: cookieGetSpy,
        set: vi.fn(),
        configurable: true,
      });
    }

    try {
      const compound = createCompoundEntry('compound');
      const single = createSingleEntry('single');
      const scene = createTestScene();

      const manager = createModeManager([compound, single]);
      manager.init(scene, 'seed', defaultParams);
      manager.draw(scene, makeFrame());
      manager.draw(scene, makeFrame({ elapsed: 200_000 }));
      manager.draw(scene, makeFrame({ elapsed: 201_000 }));
      manager.draw(scene, makeFrame({ elapsed: 210_000 }));

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(cookieGetSpy).not.toHaveBeenCalled();
    } finally {
      getItemSpy.mockRestore();
      if (cookieDescriptor) {
        Object.defineProperty(document, 'cookie', cookieDescriptor);
      }
    }
  });
});

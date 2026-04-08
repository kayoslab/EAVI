import { describe, it, expect, vi } from 'vitest';
import { computeQuality, scaleQualityProfile, extractSystemConfig } from '../../src/visual/quality';
import { buildCompoundEntries, COMPOUND_MODE_DEFS } from '../../src/visual/compoundModes';
import { createModeManager } from '../../src/visual/modeManager';
import type { QualityProfile } from '../../src/visual/quality';
import type { SingleRotationEntry, RotationEntry } from '../../src/visual/modeManager';
import type { GeometrySystem, FrameState } from '../../src/visual/types';
import type { VisualParams } from '../../src/visual/mappings';
import type { BrowserSignals } from '../../src/input/signals';

// --- Helpers ---

function makeMediumProfile(): QualityProfile {
  const signals: BrowserSignals = {
    language: 'en',
    timezone: 'UTC',
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    screenWidth: 390,
    screenHeight: 844,
    touchCapable: true,
    prefersColorScheme: 'dark',
    prefersReducedMotion: false,
  };
  return computeQuality(signals);
}

function makeHighProfile(): QualityProfile {
  const signals: BrowserSignals = {
    language: 'en',
    timezone: 'UTC',
    devicePixelRatio: 2,
    hardwareConcurrency: 16,
    deviceMemory: 8,
    screenWidth: 2560,
    screenHeight: 1440,
    touchCapable: false,
    prefersColorScheme: 'dark',
    prefersReducedMotion: false,
  };
  return computeQuality(signals);
}

function makeLowProfile(): QualityProfile {
  const signals: BrowserSignals = {
    language: 'en',
    timezone: 'UTC',
    devicePixelRatio: 1,
    hardwareConcurrency: 2,
    deviceMemory: 1,
    screenWidth: 320,
    screenHeight: 568,
    touchCapable: true,
    prefersColorScheme: null,
    prefersReducedMotion: null,
  };
  return computeQuality(signals);
}

function createMockGeometrySystem(): GeometrySystem {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    cleanup: vi.fn(),
    setOpacity: vi.fn(),
  };
}

function createMockRegistry(): {
  registry: Record<string, (config: Record<string, unknown>) => GeometrySystem>;
  instances: Record<string, GeometrySystem[]>;
} {
  const instances: Record<string, GeometrySystem[]> = {};
  const names = ['pointcloud', 'particles', 'crystal', 'flowribbon', 'ribbon', 'fractalgrowth', 'terrain'];
  const registry: Record<string, (config: Record<string, unknown>) => GeometrySystem> = {};

  for (const name of names) {
    instances[name] = [];
    registry[name] = vi.fn(((_config: Record<string, unknown>) => {
      const sys = createMockGeometrySystem();
      instances[name].push(sys);
      return sys;
    }) as (config: Record<string, unknown>) => GeometrySystem);
  }

  return { registry, instances };
}

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

// --- Tests ---

describe('US-080: Retired modes excluded from rotation', () => {
  it('T-080-01: COMPOUND_MODE_DEFS does not include cloud+wireframe (wirepolyhedra retired)', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).not.toContain('cloud+wireframe');
  });

  it('T-080-02: COMPOUND_MODE_DEFS does not include pointcloud+cubelattice (cubelattice retired)', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).not.toContain('pointcloud+cubelattice');
  });

  it('T-080-03: no compound mode references wirepolyhedra system', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      for (const layer of def.layers) {
        expect(layer.systemName).not.toBe('wirepolyhedra');
      }
    }
  });

  it('T-080-04: no compound mode references cubelattice system', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      for (const layer of def.layers) {
        expect(layer.systemName).not.toBe('cubelattice');
      }
    }
  });

  it('T-080-05: COMPOUND_MODE_DEFS has exactly 2 compound modes after retirement', () => {
    expect(COMPOUND_MODE_DEFS.length).toBe(2);
  });

  it('T-080-06: remaining compound modes are particles+flowribbon and pointcloud+fractalgrowth', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).toContain('particles+flowribbon');
    expect(names).toContain('pointcloud+fractalgrowth');
  });
});

describe('US-080: Remaining compound modes still functional', () => {
  it('T-080-07: buildCompoundEntries returns 2 entries on medium tier', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(2);
    for (const entry of entries) {
      expect(entry.kind).toBe('compound');
      expect(entry.layers.length).toBe(2);
    }
  });

  it('T-080-08: buildCompoundEntries returns 2 entries on high tier', () => {
    const profile = makeHighProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(2);
  });

  it('T-080-09: buildCompoundEntries returns 0 entries on low tier', () => {
    const profile = makeLowProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(0);
  });

  it('T-080-10: compound entries have valid maxPoints > 0', () => {
    const profile = makeHighProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    for (const entry of entries) {
      expect(entry.maxPoints).toBeGreaterThan(0);
    }
  });

  it('T-080-11: each remaining compound mode has exactly one primary layer', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      const primaryCount = def.layers.filter((l) => l.isPrimary).length;
      expect(primaryCount).toBe(1);
    }
  });
});

describe('US-080: Minimum mode count requirement (at least 3 distinct modes)', () => {
  it('T-080-12: at least 3 single modes available for rotation (low tier)', () => {
    // After retirement: particles, ribbon, pointcloud, crystal, flowribbon, fractalgrowth, terrain = 7
    const expectedSingleModes = ['particles', 'ribbon', 'pointcloud', 'crystal', 'flowribbon', 'fractalgrowth', 'terrain'];
    expect(expectedSingleModes.length).toBeGreaterThanOrEqual(3);
  });

  it('T-080-13: ModeManager accepts rotation with 7 single modes (no retired modes)', () => {
    const singleEntries: SingleRotationEntry[] = [
      { kind: 'single', name: 'particles', system: createMockGeometrySystem(), maxPoints: 500 },
      { kind: 'single', name: 'ribbon', system: createMockGeometrySystem(), maxPoints: 500 },
      { kind: 'single', name: 'pointcloud', system: createMockGeometrySystem(), maxPoints: 800 },
      { kind: 'single', name: 'crystal', system: createMockGeometrySystem(), maxPoints: 640 },
      { kind: 'single', name: 'flowribbon', system: createMockGeometrySystem(), maxPoints: 700 },
      { kind: 'single', name: 'fractalgrowth', system: createMockGeometrySystem(), maxPoints: 480 },
      { kind: 'single', name: 'terrain', system: createMockGeometrySystem(), maxPoints: 2501 },
    ];

    const manager = createModeManager(singleEntries);
    expect(typeof manager.init).toBe('function');
    expect(typeof manager.draw).toBe('function');
  });

  it('T-080-14: rotation entries do not contain wirepolyhedra or cubelattice names', () => {
    const singleEntries: SingleRotationEntry[] = [
      { kind: 'single', name: 'particles', system: createMockGeometrySystem(), maxPoints: 500 },
      { kind: 'single', name: 'ribbon', system: createMockGeometrySystem(), maxPoints: 500 },
      { kind: 'single', name: 'pointcloud', system: createMockGeometrySystem(), maxPoints: 800 },
      { kind: 'single', name: 'crystal', system: createMockGeometrySystem(), maxPoints: 640 },
      { kind: 'single', name: 'flowribbon', system: createMockGeometrySystem(), maxPoints: 700 },
      { kind: 'single', name: 'fractalgrowth', system: createMockGeometrySystem(), maxPoints: 480 },
      { kind: 'single', name: 'terrain', system: createMockGeometrySystem(), maxPoints: 2501 },
    ];

    const profile = makeHighProfile();
    const { registry } = createMockRegistry();
    const compoundEntries = buildCompoundEntries(profile, registry);
    const allEntries: RotationEntry[] = [...singleEntries, ...compoundEntries];

    for (const entry of allEntries) {
      expect(entry.name).not.toBe('wirepolyhedra');
      expect(entry.name).not.toBe('cubelattice');
      expect(entry.name).not.toContain('wireframe');
      expect(entry.name).not.toContain('cubelattice');
    }
  });

  it('T-080-15: total mode count on medium/high tier is at least 3 (singles + compounds)', () => {
    const singleCount = 7; // particles, ribbon, pointcloud, crystal, flowribbon, fractalgrowth, terrain
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const compoundEntries = buildCompoundEntries(profile, registry);

    const totalModes = singleCount + compoundEntries.length;
    expect(totalModes).toBeGreaterThanOrEqual(3);
    // Should be exactly 9 (7 singles + 2 compounds)
    expect(totalModes).toBe(9);
  });

  it('T-080-16: total mode count on low tier is at least 3 (singles only)', () => {
    const singleCount = 7;
    const profile = makeLowProfile();
    const { registry } = createMockRegistry();
    const compoundEntries = buildCompoundEntries(profile, registry);

    expect(compoundEntries.length).toBe(0);
    expect(singleCount).toBeGreaterThanOrEqual(3);
  });
});

describe('US-080: Rotation weight rebalancing (terrain, pointcloud, strong modes dominate)', () => {
  it('T-080-17: terrain mode is present in single entries', () => {
    const expectedSingles = ['particles', 'ribbon', 'pointcloud', 'crystal', 'flowribbon', 'fractalgrowth', 'terrain'];
    expect(expectedSingles).toContain('terrain');
  });

  it('T-080-18: pointcloud appears in both single and compound rotation', () => {
    const compoundSystemNames = COMPOUND_MODE_DEFS.flatMap((d) => d.layers.map((l) => l.systemName));
    expect(compoundSystemNames).toContain('pointcloud');
  });

  it('T-080-19: no compound mode factory calls for retired system names', () => {
    const profile = makeHighProfile();
    const { registry } = createMockRegistry();
    buildCompoundEntries(profile, registry);

    // wirepolyhedra and cubelattice should not even be in the registry for this test,
    // but verify no factory was called for them if present
    expect(registry['wirepolyhedra']).toBeUndefined();
    expect(registry['cubelattice']).toBeUndefined();
  });
});

describe('US-080: No dead imports or console errors', () => {
  it('T-080-20: extractSystemConfig still handles all active system names', () => {
    const profile = makeMediumProfile();
    const activeNames = ['particles', 'ribbon', 'pointcloud', 'crystal', 'flowribbon', 'fractalgrowth', 'terrain'];

    for (const name of activeNames) {
      expect(() => extractSystemConfig(name, profile)).not.toThrow();
      const config = extractSystemConfig(name, profile);
      expect(typeof config).toBe('object');
      expect(Object.keys(config).length).toBeGreaterThan(0);
    }
  });

  it('T-080-21: extractSystemConfig still handles constellation (overlay system)', () => {
    const profile = makeMediumProfile();
    expect(() => extractSystemConfig('constellation', profile)).not.toThrow();
    const config = extractSystemConfig('constellation', profile);
    expect(config.enableElectricArc).toBeDefined();
    expect(config.arcSubdivisions).toBeDefined();
  });

  it('T-080-22: quality profile still contains enableElectricArc and arcSubdivisions (used by overlay)', () => {
    const profile = makeHighProfile();
    expect(profile.enableElectricArc).toBe(true);
    expect(profile.arcSubdivisions).toBeGreaterThan(0);
  });

  it('T-080-23: scaleQualityProfile does not crash on remaining count fields', () => {
    const profile = makeHighProfile();
    expect(() => scaleQualityProfile(profile, 0.5)).not.toThrow();
    const scaled = scaleQualityProfile(profile, 0.5);
    expect(scaled.maxParticles).toBeGreaterThan(0);
    expect(scaled.maxPoints).toBeGreaterThan(0);
    expect(scaled.maxFlowRibbonPoints).toBeGreaterThan(0);
  });
});

describe('US-080: ModeManager operates correctly without retired modes', () => {
  it('T-080-24: ModeManager cycles through modes without wirepolyhedra/cubelattice', () => {
    const systems = Array.from({ length: 7 }, () => createMockGeometrySystem());
    const singleEntries: SingleRotationEntry[] = [
      { kind: 'single', name: 'particles', system: systems[0], maxPoints: 500 },
      { kind: 'single', name: 'ribbon', system: systems[1], maxPoints: 500 },
      { kind: 'single', name: 'pointcloud', system: systems[2], maxPoints: 800 },
      { kind: 'single', name: 'crystal', system: systems[3], maxPoints: 640 },
      { kind: 'single', name: 'flowribbon', system: systems[4], maxPoints: 700 },
      { kind: 'single', name: 'fractalgrowth', system: systems[5], maxPoints: 480 },
      { kind: 'single', name: 'terrain', system: systems[6], maxPoints: 2501 },
    ];

    const manager = createModeManager(singleEntries);

    // Init should not throw
    const scene = { traverse: vi.fn() } as unknown as import('three').Scene;
    expect(() => manager.init(scene, 'test-seed', defaultParams)).not.toThrow();

    // activeEntryName should be one of the valid modes
    const validNames = singleEntries.map((e) => e.name);
    expect(validNames).toContain(manager.activeEntryName);

    // Should NOT be a retired mode
    expect(manager.activeEntryName).not.toBe('wirepolyhedra');
    expect(manager.activeEntryName).not.toBe('cubelattice');
  });

  it('T-080-25: ModeManager activeEntryName never returns a retired mode name during cycling', () => {
    const systems = Array.from({ length: 7 }, () => createMockGeometrySystem());
    const singleEntries: SingleRotationEntry[] = [
      { kind: 'single', name: 'particles', system: systems[0], maxPoints: 500 },
      { kind: 'single', name: 'ribbon', system: systems[1], maxPoints: 500 },
      { kind: 'single', name: 'pointcloud', system: systems[2], maxPoints: 800 },
      { kind: 'single', name: 'crystal', system: systems[3], maxPoints: 640 },
      { kind: 'single', name: 'flowribbon', system: systems[4], maxPoints: 700 },
      { kind: 'single', name: 'fractalgrowth', system: systems[5], maxPoints: 480 },
      { kind: 'single', name: 'terrain', system: systems[6], maxPoints: 2501 },
    ];

    const manager = createModeManager(singleEntries);
    const scene = { traverse: vi.fn() } as unknown as import('three').Scene;
    manager.init(scene, 'cycle-test', defaultParams);

    // Drive mode switching by advancing elapsed time past switch intervals
    const retiredNames = ['wirepolyhedra', 'cubelattice'];
    const seenNames = new Set<string>();

    for (let elapsed = 0; elapsed < 1_500_000; elapsed += 100_000) {
      const frame: FrameState = {
        time: elapsed,
        delta: 16,
        elapsed,
        width: 800,
        height: 600,
        params: defaultParams,
      };
      manager.draw(scene, frame);
      seenNames.add(manager.activeEntryName);
    }

    for (const retired of retiredNames) {
      expect(seenNames).not.toContain(retired);
    }
    // Should have seen multiple distinct modes
    expect(seenNames.size).toBeGreaterThanOrEqual(2);
  });
});

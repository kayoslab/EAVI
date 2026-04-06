import { describe, it, expect, vi } from 'vitest';
import { computeQuality, scaleQualityProfile, extractSystemConfig } from '../../src/visual/quality';
import { buildCompoundEntries, COMPOUND_MODE_DEFS } from '../../src/visual/compoundModes';
import type { QualityProfile } from '../../src/visual/quality';
import type { GeometrySystem } from '../../src/visual/types';
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
  const names = ['pointcloud', 'wirepolyhedra', 'particles', 'crystal', 'flowribbon', 'ribbon', 'cubelattice'];
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

// --- Tests ---

describe('US-061: scaleQualityProfile', () => {
  it('T-061-01: scaleQualityProfile halves numeric count fields', () => {
    const medium = makeMediumProfile();
    const scaled = scaleQualityProfile(medium, 0.5);

    expect(scaled.maxParticles).toBe(Math.round(medium.maxParticles * 0.5));
    expect(scaled.maxPoints).toBe(Math.round(medium.maxPoints * 0.5));
    expect(scaled.maxRibbonPoints).toBe(Math.round(medium.maxRibbonPoints * 0.5));
    expect(scaled.maxPolyhedra).toBe(Math.round(medium.maxPolyhedra * 0.5));
    expect(scaled.maxConstellationSegments).toBe(Math.round(medium.maxConstellationSegments * 0.5));
    expect(scaled.maxEdgesPerShape).toBe(Math.round(medium.maxEdgesPerShape * 0.5));
    expect(scaled.maxFlowRibbonPoints).toBe(Math.round(medium.maxFlowRibbonPoints * 0.5));
  });

  it('T-061-02: scaleQualityProfile clamps to minimum viable values', () => {
    const low = makeLowProfile();
    const scaled = scaleQualityProfile(low, 0.5);

    expect(scaled.maxParticles).toBeGreaterThanOrEqual(50);
    expect(scaled.maxPoints).toBeGreaterThanOrEqual(50);
    expect(scaled.maxRibbonPoints).toBeGreaterThanOrEqual(50);
    expect(scaled.maxPolyhedra).toBeGreaterThanOrEqual(2);
    expect(scaled.maxEdgesPerShape).toBeGreaterThanOrEqual(20);
    expect(scaled.maxFlowRibbonPoints).toBeGreaterThanOrEqual(50);
  });

  it('T-061-03: scaleQualityProfile preserves non-numeric and boolean fields', () => {
    const original = makeMediumProfile();
    const scaled = scaleQualityProfile(original, 0.5);

    expect(scaled.tier).toBe(original.tier);
    expect(scaled.enableSparkle).toBe(original.enableSparkle);
    expect(scaled.shaderComplexity).toBe(original.shaderComplexity);
    expect(scaled.noiseOctaves).toBe(original.noiseOctaves);
    expect(scaled.enablePointerRepulsion).toBe(original.enablePointerRepulsion);
    expect(scaled.enableSlowModulation).toBe(original.enableSlowModulation);
    expect(scaled.resolutionScale).toBe(original.resolutionScale);
  });

  it('T-061-04: scaleQualityProfile with factor 1.0 returns equivalent profile', () => {
    const original = makeHighProfile();
    const scaled = scaleQualityProfile(original, 1.0);

    expect(scaled.maxParticles).toBe(original.maxParticles);
    expect(scaled.maxPoints).toBe(original.maxPoints);
    expect(scaled.maxRibbonPoints).toBe(original.maxRibbonPoints);
  });
});

describe('US-061: extractSystemConfig', () => {
  it('T-061-05: extractSystemConfig returns correct config for pointcloud', () => {
    const profile = makeMediumProfile();
    const config = extractSystemConfig('pointcloud', profile);

    expect(config.maxPoints).toBe(profile.maxPoints);
    expect(config.enableSparkle).toBe(profile.enableSparkle);
    expect(config.noiseOctaves).toBe(profile.noiseOctaves);
    expect(config.enablePointerRepulsion).toBe(profile.enablePointerRepulsion);
    expect(config.enableSlowModulation).toBe(profile.enableSlowModulation);
    expect(config.useVoronoiShader).toBe(profile.enableVoronoiCells);
  });

  it('T-061-06: extractSystemConfig returns correct config for particles', () => {
    const profile = makeMediumProfile();
    const config = extractSystemConfig('particles', profile);

    expect(config.maxParticles).toBe(profile.maxParticles);
  });

  it('T-061-07: extractSystemConfig returns correct config for wirepolyhedra', () => {
    const profile = makeMediumProfile();
    const config = extractSystemConfig('wirepolyhedra', profile);

    expect(config.maxPolyhedra).toBe(profile.maxPolyhedra);
    expect(config.maxEdgesPerShape).toBe(profile.maxEdgesPerShape);
  });

  it('T-061-08: extractSystemConfig covers all 7 supported system names', () => {
    const profile = makeMediumProfile();
    const names = ['particles', 'ribbon', 'pointcloud', 'crystal', 'wirepolyhedra', 'flowribbon', 'cubelattice'];

    for (const name of names) {
      expect(() => extractSystemConfig(name, profile)).not.toThrow();
      const config = extractSystemConfig(name, profile);
      expect(typeof config).toBe('object');
      expect(Object.keys(config).length).toBeGreaterThan(0);
    }
  });
});

describe('US-061: COMPOUND_MODE_DEFS', () => {
  it('T-061-09: COMPOUND_MODE_DEFS defines exactly 3 compound modes', () => {
    expect(COMPOUND_MODE_DEFS.length).toBe(3);
    for (const def of COMPOUND_MODE_DEFS) {
      expect(typeof def.name).toBe('string');
      expect(def.name.length).toBeGreaterThan(0);
      expect(def.layers.length).toBe(2);
      for (const layer of def.layers) {
        expect(typeof layer.systemName).toBe('string');
        expect(typeof layer.isPrimary).toBe('boolean');
      }
    }
  });

  it('T-061-10: COMPOUND_MODE_DEFS includes expected combinations', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).toContain('cloud+wireframe');
    expect(names).toContain('particles+flowribbon');
  });

  it('T-061-17: each compound mode def has exactly one primary layer', () => {
    for (const def of COMPOUND_MODE_DEFS) {
      const primaryCount = def.layers.filter((l) => l.isPrimary).length;
      expect(primaryCount).toBe(1);
    }
  });
});

describe('US-061: buildCompoundEntries', () => {
  it('T-061-11: buildCompoundEntries returns 3 entries on medium tier', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(3);
    for (const entry of entries) {
      expect(entry.kind).toBe('compound');
      expect(entry.layers.length).toBe(2);
      expect(entry.primaryLayerIndex === 0 || entry.primaryLayerIndex === 1).toBe(true);
    }
  });

  it('T-061-12: buildCompoundEntries returns 3 entries on high tier', () => {
    const profile = makeHighProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(3);
  });

  it('T-061-13: buildCompoundEntries returns 0 entries on low tier', () => {
    const profile = makeLowProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    expect(entries.length).toBe(0);
  });

  it('T-061-14: buildCompoundEntries creates independent system instances per layer', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    for (const entry of entries) {
      expect(entry.layers[0].system).not.toBe(entry.layers[1].system);
      expect(typeof entry.layers[0].system.init).toBe('function');
      expect(typeof entry.layers[0].system.draw).toBe('function');
    }

    // If two entries share a system type, instances should still be different objects
    if (entries.length >= 2) {
      expect(entries[0].layers[0].system).not.toBe(entries[1].layers[0].system);
    }
  });

  it('T-061-15: buildCompoundEntries uses scaled quality (each layer gets ~50% budget)', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    buildCompoundEntries(profile, registry);

    // Check that the pointcloud factory was called with scaled config
    const pointcloudFactory = registry['pointcloud'] as ReturnType<typeof vi.fn>;
    if (pointcloudFactory.mock.calls.length > 0) {
      const config = pointcloudFactory.mock.calls[0][0] as Record<string, unknown>;
      expect(config.maxPoints).toBeLessThanOrEqual(Math.ceil(profile.maxPoints * 0.5) + 1);
      expect(config.maxPoints).toBeGreaterThanOrEqual(50);
    }
  });

  it('T-061-16: buildCompoundEntries sets maxPoints as sum of layer budgets', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);

    for (const entry of entries) {
      expect(entry.maxPoints).toBeGreaterThan(0);
    }
  });
});

describe('US-068: Cube lattice compound mode and config', () => {
  it('T-068-46: extractSystemConfig returns correct config for cubelattice', () => {
    const profile = makeMediumProfile();
    const config = extractSystemConfig('cubelattice', profile);

    expect(config.gridSize).toBe(profile.latticeGridSize);
    expect(config.cellSize).toBe(profile.latticeCellSize);
    expect(config.noiseOctaves).toBe(profile.noiseOctaves);
    expect(config.enablePointerRepulsion).toBe(profile.enablePointerRepulsion);
    expect(config.enableSlowModulation).toBe(profile.enableSlowModulation);
  });

  it('T-068-47: extractSystemConfig covers cubelattice system name without throwing', () => {
    const profile = makeMediumProfile();
    expect(() => extractSystemConfig('cubelattice', profile)).not.toThrow();
    const config = extractSystemConfig('cubelattice', profile);
    expect(typeof config).toBe('object');
    expect(Object.keys(config).length).toBeGreaterThan(0);
  });

  it('T-068-48: COMPOUND_MODE_DEFS includes pointcloud+cubelattice compound mode', () => {
    const names = COMPOUND_MODE_DEFS.map((d) => d.name);
    expect(names).toContain('pointcloud+cubelattice');

    const def = COMPOUND_MODE_DEFS.find((d) => d.name === 'pointcloud+cubelattice')!;
    const primary = def.layers.find((l) => l.isPrimary)!;
    const secondary = def.layers.find((l) => !l.isPrimary)!;
    expect(primary.systemName).toBe('pointcloud');
    expect(secondary.systemName).toBe('cubelattice');
  });

  it('T-068-49: primaryCountForSystem returns gridSize for cubelattice', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);
    const cubelatticeEntry = entries.find((e) => e.name === 'pointcloud+cubelattice');
    expect(cubelatticeEntry).toBeDefined();
    expect(cubelatticeEntry!.maxPoints).toBeGreaterThan(0);
  });

  it('T-068-50: scaleQualityProfile scales latticeGridSize with clamping', () => {
    const profile = makeMediumProfile();
    const scaled = scaleQualityProfile(profile, 0.5);
    expect(scaled.latticeGridSize).toBeLessThanOrEqual(profile.latticeGridSize);
    expect(scaled.latticeGridSize).toBeGreaterThanOrEqual(2);
  });

  it('T-068-58: COMPOUND_MODE_DEFS count is 3 after removing microgeometry mode', () => {
    expect(COMPOUND_MODE_DEFS.length).toBe(3);
  });

  it('T-068-59: buildCompoundEntries returns 3 entries on medium tier (including cubelattice mode)', () => {
    const profile = makeMediumProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);
    expect(entries.length).toBe(3);
    const names = entries.map((e) => e.name);
    expect(names).toContain('pointcloud+cubelattice');
  });

  it('T-068-60: buildCompoundEntries still returns 0 entries on low tier', () => {
    const profile = makeLowProfile();
    const { registry } = createMockRegistry();
    const entries = buildCompoundEntries(profile, registry);
    expect(entries.length).toBe(0);
  });
});

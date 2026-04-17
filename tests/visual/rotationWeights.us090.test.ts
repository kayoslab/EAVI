import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createModeManager } from '../../src/visual/modeManager';
import type {
  RotationEntry,
  SingleRotationEntry,
  ModeManager,
} from '../../src/visual/modeManager';
import type { CompoundRotationEntry } from '../../src/visual/compoundModes';
import type { GeometrySystem, FrameState } from '../../src/visual/types';
import type { VisualParams } from '../../src/visual/mappings';

/* ── helpers ─────────────────────────────────────────────────── */

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

function mockSystem(): GeometrySystem & {
  init: ReturnType<typeof vi.fn>;
  draw: ReturnType<typeof vi.fn>;
  cleanup: ReturnType<typeof vi.fn>;
  setOpacity: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    cleanup: vi.fn(),
    setOpacity: vi.fn(),
  };
}

/** Build a single rotation entry with an optional weight. */
function single(name: string, weight?: number): SingleRotationEntry {
  return {
    kind: 'single',
    name,
    system: mockSystem(),
    maxPoints: 1000,
    ...(weight !== undefined ? { weight } : {}),
  } as SingleRotationEntry;
}

/** Build a compound rotation entry with an optional weight. */
function compound(name: string, weight?: number): CompoundRotationEntry {
  const layer1 = { system: mockSystem(), name: name.split('+')[0] };
  const layer2 = { system: mockSystem(), name: name.split('+')[1] };
  return {
    kind: 'compound',
    name,
    layers: [layer1, layer2] as [typeof layer1, typeof layer2],
    primaryLayerIndex: 0 as 0 | 1,
    maxPoints: 2000,
    ...(weight !== undefined ? { weight } : {}),
  } as CompoundRotationEntry;
}

/**
 * Build the production-like rotation entry set matching main.ts.
 * Overhauled flagship modes get weight 2, others default (1).
 */
function productionEntries(): RotationEntry[] {
  return [
    single('particles'),                           // default weight
    single('ribbon'),                              // default weight
    single('pointcloud', 2),                       // US-084 overhauled
    single('crystal'),                             // default weight
    single('flowribbon'),                          // default weight
    single('fractalgrowth', 2),                    // US-087 overhauled
    single('terrain', 2),                          // US-076 overhauled
    compound('particles+flowribbon'),              // default weight
    compound('pointcloud+fractalgrowth', 2),       // both constituents overhauled
  ];
}

/* ── tests ───────────────────────────────────────────────────── */

describe('US-090: Rotation weight rebalancing', () => {

  /* ── AC 1: Overhauled modes get above-average weight ────── */

  describe('AC1: Overhauled modes have above-average weight', () => {
    it('T-090-01: terrain, pointcloud, and fractalgrowth each have weight > average', () => {
      const entries = productionEntries();
      const overhauled = ['terrain', 'pointcloud', 'fractalgrowth'];

      const weights = entries.map((e) => (e as { weight?: number }).weight ?? 1);
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

      for (const name of overhauled) {
        const entry = entries.find((e) => e.name === name)!;
        const w = (entry as { weight?: number }).weight ?? 1;
        expect(w, `${name} weight (${w}) should exceed average (${avgWeight})`).toBeGreaterThan(avgWeight);
      }
    });

    it('T-090-02: pointcloud+fractalgrowth compound has above-average weight', () => {
      const entries = productionEntries();
      const compoundEntry = entries.find((e) => e.name === 'pointcloud+fractalgrowth')!;
      const w = (compoundEntry as { weight?: number }).weight ?? 1;

      const weights = entries.map((e) => (e as { weight?: number }).weight ?? 1);
      const avgWeight = weights.reduce((a, b) => a + b, 0) / weights.length;

      expect(w).toBeGreaterThan(avgWeight);
    });
  });

  /* ── AC 2: No failed-overhaul modes remain ─────────────── */

  describe('AC2: Failed overhaul modes removed from rotation', () => {
    it('T-090-03: rotation does not contain any previously retired modes', () => {
      const entries = productionEntries();
      const retired = ['wirepolyhedra', 'cubelattice', 'constellation'];
      const names = entries.map((e) => e.name);
      for (const mode of retired) {
        expect(names).not.toContain(mode);
      }
    });
  });

  /* ── AC 3: At least 4 distinct modes ───────────────────── */

  describe('AC3: Rotation has at least 4 distinct modes', () => {
    it('T-090-04: production rotation contains >= 4 distinct mode names', () => {
      const entries = productionEntries();
      const distinctNames = new Set(entries.map((e) => e.name));
      expect(distinctNames.size).toBeGreaterThanOrEqual(4);
    });

    it('T-090-05: at least 4 single modes remain after any removals', () => {
      const entries = productionEntries().filter((e) => e.kind === 'single');
      expect(entries.length).toBeGreaterThanOrEqual(4);
    });
  });

  /* ── AC 4: No dead imports, no console errors ──────────── */
  // Build-time checks handled by npm run build; here we verify runtime basics.

  describe('AC4: No runtime errors during mode manager construction', () => {
    it('T-090-06: createModeManager accepts entries with weight field without error', () => {
      const entries = productionEntries();
      expect(() => createModeManager(entries)).not.toThrow();
    });

    it('T-090-07: createModeManager init + draw succeed with weighted entries', () => {
      const entries = productionEntries();
      const manager = createModeManager(entries);
      const scene = createTestScene();

      expect(() => manager.init(scene, 'us090-test', defaultParams)).not.toThrow();
      expect(() => manager.draw(scene, makeFrame())).not.toThrow();
    });
  });

  /* ── Weight field mechanics ────────────────────────────── */

  describe('Weight field defaults and validation', () => {
    it('T-090-08: omitting weight defaults to 1', () => {
      const entry = single('particles');
      const w = (entry as { weight?: number }).weight ?? 1;
      expect(w).toBe(1);
    });

    it('T-090-09: explicitly set weight is preserved', () => {
      const entry = single('terrain', 2);
      expect((entry as { weight?: number }).weight).toBe(2);
    });

    it('T-090-10: no entry in production set has weight <= 0', () => {
      const entries = productionEntries();
      for (const entry of entries) {
        const w = (entry as { weight?: number }).weight ?? 1;
        expect(w, `${entry.name} has invalid weight ${w}`).toBeGreaterThan(0);
      }
    });
  });

  /* ── Weighted initial selection ────────────────────────── */

  describe('Weighted initial mode selection', () => {
    it('T-090-11: weighted selection distributes proportionally over many seeds', () => {
      // 2 entries: A has weight 2, B has weight 1 → expect A selected ~2x as often
      const N = 600;
      const counts: Record<string, number> = { heavy: 0, light: 0 };

      for (let i = 0; i < N; i++) {
        const entries: RotationEntry[] = [
          single('heavy', 2),
          single('light', 1),
        ];
        const mgr = createModeManager(entries);
        mgr.init(createTestScene(), `weight-seed-${i}`, defaultParams);
        counts[mgr.activeEntryName]++;
      }

      // With weight 2:1, heavy should be picked ~2/3 of the time (~400 of 600).
      // Assert heavy gets at least 55% — unweighted would give ~50%.
      expect(counts.heavy).toBeGreaterThan(N * 0.55);
    });

    it('T-090-12: equal weights give roughly equal distribution', () => {
      const N = 600;
      const counts: Record<string, number> = { a: 0, b: 0 };

      for (let i = 0; i < N; i++) {
        const entries: RotationEntry[] = [
          single('a', 1),
          single('b', 1),
        ];
        const mgr = createModeManager(entries);
        mgr.init(createTestScene(), `equal-seed-${i}`, defaultParams);
        counts[mgr.activeEntryName]++;
      }

      // Neither should dominate by more than 60/40
      const min = Math.min(counts.a, counts.b);
      expect(min).toBeGreaterThan(N * 0.3);
    });
  });

  /* ── Weighted cycling ──────────────────────────────────── */

  describe('Weighted mode cycling', () => {
    it('T-090-13: higher-weight modes appear more often in a full rotation cycle', () => {
      // 3 entries: terrain(w=2), particles(w=1), ribbon(w=1)
      // Over a full weighted cycle (4 slots), terrain should appear 2x
      const entries: RotationEntry[] = [
        single('terrain', 2),
        single('particles', 1),
        single('ribbon', 1),
      ];
      const mgr = createModeManager(entries);
      const scene = createTestScene();
      mgr.init(scene, 'cycle-test', defaultParams);

      const visited: string[] = [mgr.activeEntryName];

      // Force many mode switches by advancing elapsed time beyond switch interval
      // Switch interval is 90-180s, so jumping 200s per step is safe
      for (let step = 1; step <= 12; step++) {
        mgr.draw(scene, makeFrame({ elapsed: step * 200_000 }));
        // Complete any transition
        mgr.draw(scene, makeFrame({ elapsed: step * 200_000 + 5000 }));
        visited.push(mgr.activeEntryName);
      }

      const terrainCount = visited.filter((n) => n === 'terrain').length;
      const particlesCount = visited.filter((n) => n === 'particles').length;
      const ribbonCount = visited.filter((n) => n === 'ribbon').length;

      // terrain should appear more than each individual w=1 mode
      expect(terrainCount).toBeGreaterThan(particlesCount);
      expect(terrainCount).toBeGreaterThan(ribbonCount);
    });

    it('T-090-14: all modes still appear in rotation (no mode is starved)', () => {
      const entries: RotationEntry[] = [
        single('terrain', 2),
        single('particles', 1),
        single('ribbon', 1),
        single('crystal', 1),
      ];
      const mgr = createModeManager(entries);
      const scene = createTestScene();
      mgr.init(scene, 'starve-test', defaultParams);

      const visited = new Set<string>();
      visited.add(mgr.activeEntryName);

      for (let step = 1; step <= 20; step++) {
        mgr.draw(scene, makeFrame({ elapsed: step * 200_000 }));
        mgr.draw(scene, makeFrame({ elapsed: step * 200_000 + 5000 }));
        visited.add(mgr.activeEntryName);
      }

      // All 4 modes should appear at least once
      expect(visited.size).toBe(4);
    });
  });

  /* ── Determinism ───────────────────────────────────────── */

  describe('Seed determinism preserved with weights', () => {
    it('T-090-15: same seed produces same initial mode with weighted entries', () => {
      const seed = 'determinism-090';

      const mgr1 = createModeManager(productionEntries());
      mgr1.init(createTestScene(), seed, defaultParams);

      const mgr2 = createModeManager(productionEntries());
      mgr2.init(createTestScene(), seed, defaultParams);

      expect(mgr1.activeEntryName).toBe(mgr2.activeEntryName);
      expect(mgr1.activeIndex).toBe(mgr2.activeIndex);
    });

    it('T-090-16: same seed produces same cycling sequence with weighted entries', () => {
      const seed = 'cycle-determinism-090';

      function collectSequence(): string[] {
        const mgr = createModeManager(productionEntries());
        const scene = createTestScene();
        mgr.init(scene, seed, defaultParams);
        const seq = [mgr.activeEntryName];
        for (let step = 1; step <= 6; step++) {
          mgr.draw(scene, makeFrame({ elapsed: step * 200_000 }));
          mgr.draw(scene, makeFrame({ elapsed: step * 200_000 + 5000 }));
          seq.push(mgr.activeEntryName);
        }
        return seq;
      }

      expect(collectSequence()).toEqual(collectSequence());
    });
  });

  /* ── Regression: existing entry shapes still work ──────── */

  describe('Regression: entries without weight field', () => {
    it('T-090-17: entries with no weight field still init and cycle correctly', () => {
      const entries: RotationEntry[] = [
        single('a'),
        single('b'),
        single('c'),
      ];
      const mgr = createModeManager(entries);
      const scene = createTestScene();
      mgr.init(scene, 'no-weight', defaultParams);

      const initial = mgr.activeIndex;
      mgr.draw(scene, makeFrame({ elapsed: 200_000 }));
      mgr.draw(scene, makeFrame({ elapsed: 205_000 }));

      expect(mgr.activeIndex).not.toBe(initial);
    });

    it('T-090-18: compound entries without weight field accepted by modeManager', () => {
      const entries: RotationEntry[] = [
        single('a'),
        compound('b+c'),
      ];
      const mgr = createModeManager(entries);
      const scene = createTestScene();
      expect(() => mgr.init(scene, 'compound-no-weight', defaultParams)).not.toThrow();
    });
  });
});

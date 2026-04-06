import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { readSignals } from '../../src/input/signals';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { MappingInputs, VisualParams } from '../../src/visual/mappings';
import { evolveParams, _clearCurveCache } from '../../src/visual/evolution';
import {
  createParticleField,
  getParticlePositions,
} from '../../src/visual/systems/particleField';
import type { FrameState } from '../../src/visual/types';

const defaultSignals: BrowserSignals = {
  language: 'en-US',
  timezone: 'America/New_York',
  screenWidth: 1920,
  screenHeight: 1080,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };
const defaultPointer: PointerState = { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: true };

const defaultInputs: MappingInputs = {
  signals: defaultSignals,
  geo: defaultGeo,
  pointer: defaultPointer,
  sessionSeed: 'a1b2c3d4e5f6',
  bass: 128,
  treble: 100,
  timeOfDay: 14,
};

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

function makeFrame(params: VisualParams, overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    params,
    width: 800,
    height: 600,
    pointerX: 0.5,
    pointerY: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// US-024: Add reduced-motion fallback
// ---------------------------------------------------------------------------

describe('US-024: Add reduced-motion fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    _clearCurveCache();
  });

  // --- AC1: Reduced-motion preference is detected ---

  describe('AC1: Reduced-motion preference is detected', () => {
    it('T-024-01: readSignals returns prefersReducedMotion=true when media query matches', () => {
      window.matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      const signals = readSignals();
      expect(signals.prefersReducedMotion).toBe(true);
    });

    it('T-024-02: readSignals returns prefersReducedMotion=false when media query does not match', () => {
      window.matchMedia = vi.fn((_query: string) => ({
        matches: false,
        media: _query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;
      const signals = readSignals();
      expect(signals.prefersReducedMotion).toBe(false);
    });

    it('T-024-03: readSignals returns prefersReducedMotion=null when matchMedia is unavailable', () => {
      const original = window.matchMedia;
      // @ts-expect-error — intentionally removing matchMedia for fallback test
      window.matchMedia = undefined;
      const signals = readSignals();
      expect(signals.prefersReducedMotion).toBeNull();
      window.matchMedia = original;
    });
  });

  // --- AC2: Motion amplitude is lowered ---

  describe('AC2: Motion amplitude is lowered', () => {
    it('T-024-04: motionAmplitude is significantly reduced when prefersReducedMotion=true', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      expect(reduced.motionAmplitude).toBeGreaterThan(0);
      expect(reduced.motionAmplitude).toBeLessThanOrEqual(0.3);
    });

    it('T-024-05: motionAmplitude is 1.0 when prefersReducedMotion=false', () => {
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(normal.motionAmplitude).toBe(1.0);
    });

    it('T-024-06: motionAmplitude defaults to 1.0 when prefersReducedMotion=null', () => {
      const result = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: null },
      });
      expect(result.motionAmplitude).toBe(1.0);
    });

    it('T-024-07: reduced motionAmplitude is strictly less than normal motionAmplitude', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(reduced.motionAmplitude).toBeLessThan(normal.motionAmplitude);
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-08: particle base speed is attenuated by motionAmplitude', () => {
      const scene = new THREE.Scene();
      const seed = 'test-seed';

      // Run with full motion
      const fieldFull = createParticleField();
      const fullParams = { ...defaultParams, cadence: 0.7, motionAmplitude: 1.0 };
      fieldFull.init(scene, seed, fullParams);
      const posBefore = getParticlePositions(fieldFull).map(p => ({ ...p }));
      fieldFull.draw(scene, makeFrame(fullParams));
      const posAfterFull = getParticlePositions(fieldFull);

      // Run with reduced motion
      const fieldReduced = createParticleField();
      const reducedParams = { ...defaultParams, cadence: 0.7, motionAmplitude: 0.2 };
      fieldReduced.init(scene, seed, reducedParams);
      const posBeforeReduced = getParticlePositions(fieldReduced).map(p => ({ ...p }));
      fieldReduced.draw(scene, makeFrame(reducedParams));
      const posAfterReduced = getParticlePositions(fieldReduced);

      // Compute total displacement for each
      let totalDisplacementFull = 0;
      for (let i = 0; i < posBefore.length; i++) {
        const dx = posAfterFull[i].x - posBefore[i].x;
        const dy = posAfterFull[i].y - posBefore[i].y;
        totalDisplacementFull += Math.sqrt(dx * dx + dy * dy);
      }

      let totalDisplacementReduced = 0;
      for (let i = 0; i < posBeforeReduced.length; i++) {
        const dx = posAfterReduced[i].x - posBeforeReduced[i].x;
        const dy = posAfterReduced[i].y - posBeforeReduced[i].y;
        totalDisplacementReduced += Math.sqrt(dx * dx + dy * dy);
      }

      expect(totalDisplacementReduced).toBeLessThan(totalDisplacementFull);
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-09: bass-driven motion is attenuated under reduced-motion', () => {
      const scene = new THREE.Scene();
      const seed = 'bass-test';

      // Full motion with bass
      const fieldFull = createParticleField();
      const fullParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 1.0 };
      fieldFull.init(scene, seed, fullParams);
      const posBefore = getParticlePositions(fieldFull).map(p => ({ ...p }));
      fieldFull.draw(scene, makeFrame(fullParams));
      const posAfterFull = getParticlePositions(fieldFull);

      // Reduced motion with same bass
      const fieldReduced = createParticleField();
      const reducedParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 0.2 };
      fieldReduced.init(scene, seed, reducedParams);
      const posBeforeReduced = getParticlePositions(fieldReduced).map(p => ({ ...p }));
      fieldReduced.draw(scene, makeFrame(reducedParams));
      const posAfterReduced = getParticlePositions(fieldReduced);

      let displacementFull = 0;
      for (let i = 0; i < posBefore.length; i++) {
        const dx = posAfterFull[i].x - posBefore[i].x;
        const dy = posAfterFull[i].y - posBefore[i].y;
        displacementFull += Math.sqrt(dx * dx + dy * dy);
      }

      let displacementReduced = 0;
      for (let i = 0; i < posBeforeReduced.length; i++) {
        const dx = posAfterReduced[i].x - posBeforeReduced[i].x;
        const dy = posAfterReduced[i].y - posBeforeReduced[i].y;
        displacementReduced += Math.sqrt(dx * dx + dy * dy);
      }

      expect(displacementReduced).toBeLessThan(displacementFull);
    });

    it('T-024-10: evolution does not alter motionAmplitude — it passes through unchanged', () => {
      const reducedBase = { ...defaultParams, motionAmplitude: 0.2 };
      const normalBase = { ...defaultParams, motionAmplitude: 1.0 };

      const evolvedReduced = evolveParams(reducedBase, 5000, 'evo-seed');
      const evolvedNormal = evolveParams(normalBase, 5000, 'evo-seed');

      expect(evolvedReduced.motionAmplitude).toBe(0.2);
      expect(evolvedNormal.motionAmplitude).toBe(1.0);
    });

    it('T-024-11: motionAmplitude stays constant across multiple evolution time steps', () => {
      const base = { ...defaultParams, motionAmplitude: 0.2 };
      const times = [0, 1000, 5000, 10000, 30000, 60000];
      for (const t of times) {
        const evolved = evolveParams(base, t, 'stability-seed');
        expect(evolved.motionAmplitude).toBe(0.2);
      }
    });
  });

  // --- AC3: Core visual identity is preserved ---

  describe('AC3: Core visual identity is preserved', () => {
    it('T-024-12: palette hue and saturation are identical for reduced vs normal motion', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(reduced.paletteHue).toBe(normal.paletteHue);
      expect(reduced.paletteSaturation).toBe(normal.paletteSaturation);
    });

    it('T-024-13: density is identical for reduced vs normal motion', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(reduced.density).toBe(normal.density);
    });

    it('T-024-14: cadence is identical for reduced vs normal motion', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(reduced.cadence).toBe(normal.cadence);
    });

    it('T-024-15: curveSoftness and structureComplexity are identical for reduced vs normal motion', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });
      expect(reduced.curveSoftness).toBe(normal.curveSoftness);
      expect(reduced.structureComplexity).toBe(normal.structureComplexity);
    });

    it('T-024-16: particle count is identical for reduced vs normal motion', () => {
      const scene = new THREE.Scene();
      const seed = 'count-test';

      const fieldReduced = createParticleField();
      fieldReduced.init(scene, seed, { ...defaultParams, motionAmplitude: 0.2 });

      const fieldNormal = createParticleField();
      fieldNormal.init(scene, seed, { ...defaultParams, motionAmplitude: 1.0 });

      expect(fieldReduced.particles.length).toBe(fieldNormal.particles.length);
      expect(fieldReduced.particles.length).toBeGreaterThan(0);
    });

    it('T-024-17: only motionAmplitude differs between reduced and normal outputs — all other params match', () => {
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });

      const reducedEntries = Object.entries(reduced) as [keyof VisualParams, number][];
      for (const [key, value] of reducedEntries) {
        if (key === 'motionAmplitude' || key === 'dispersion') {
          expect(value).not.toBe(normal[key]);
        } else {
          expect(value).toBe(normal[key]);
        }
      }
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-18: scene still renders without errors when motionAmplitude=0.2', () => {
      const scene = new THREE.Scene();

      const field = createParticleField();
      const reducedParams = { ...defaultParams, motionAmplitude: 0.2, bassEnergy: 0.5, trebleEnergy: 0.5 };
      field.init(scene, 'render-test', reducedParams);

      expect(() => {
        field.draw(scene, makeFrame(reducedParams));
        field.draw(scene, makeFrame(reducedParams, { time: 2000, delta: 16, elapsed: 2000 }));
        field.draw(scene, makeFrame(reducedParams, { time: 3000, delta: 16, elapsed: 3000 }));
      }).not.toThrow();
    });
  });

  // --- AC4: No separate page is required ---

  describe('AC4: No separate page is required', () => {
    it('T-024-19: mapSignalsToVisuals handles both motion states through the same code path', () => {
      // Both true and false use the same function — no branching to a different page/renderer
      const reduced = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: true },
      });
      const normal = mapSignalsToVisuals({
        ...defaultInputs,
        signals: { ...defaultSignals, prefersReducedMotion: false },
      });

      // Both return the same VisualParams shape
      expect(Object.keys(reduced).sort()).toEqual(Object.keys(normal).sort());
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-20: same ParticleField instance handles both amplitude values without re-creation', () => {
      const scene = new THREE.Scene();

      const field = createParticleField();
      field.init(scene, 'dual-test', { ...defaultParams, motionAmplitude: 1.0 });

      // Draw with full motion
      expect(() => field.draw(scene, makeFrame({ ...defaultParams, motionAmplitude: 1.0 }))).not.toThrow();

      // Draw with reduced motion using the same field — no separate page/instance needed
      expect(() => field.draw(scene, makeFrame({ ...defaultParams, motionAmplitude: 0.2 }))).not.toThrow();
    });

    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-21: reduced-motion does not disable rendering — particles still move (just less)', () => {
      const scene = new THREE.Scene();
      const seed = 'alive-test';

      const field = createParticleField();
      const params = { ...defaultParams, cadence: 0.7, motionAmplitude: 0.2 };
      field.init(scene, seed, params);
      const before = getParticlePositions(field).map(p => ({ ...p }));

      // Run several frames
      for (let t = 0; t < 5; t++) {
        field.draw(scene, makeFrame(params, { time: t * 100, delta: 16, elapsed: t * 100 }));
      }

      const after = getParticlePositions(field);
      let anyMoved = false;
      for (let i = 0; i < before.length; i++) {
        if (before[i].x !== after[i].x || before[i].y !== after[i].y) {
          anyMoved = true;
          break;
        }
      }
      expect(anyMoved).toBe(true);
    });
  });

  // --- Edge cases and integration ---

  describe('Edge cases', () => {
    // TODO: Re-enable when Canvas 2D systems are ported to Three.js
    it.skip('T-024-22: motionAmplitude=0.2 with zero bass and treble still allows cadence-driven motion', () => {
      const scene = new THREE.Scene();

      const field = createParticleField();
      const params = { ...defaultParams, cadence: 0.7, motionAmplitude: 0.2, bassEnergy: 0, trebleEnergy: 0 };
      field.init(scene, 'edge-seed', params);
      const before = getParticlePositions(field).map(p => ({ ...p }));
      field.draw(scene, makeFrame(params));
      const after = getParticlePositions(field);

      let anyMoved = false;
      for (let i = 0; i < before.length; i++) {
        if (before[i].x !== after[i].x || before[i].y !== after[i].y) {
          anyMoved = true;
          break;
        }
      }
      expect(anyMoved).toBe(true);
    });

    it('T-024-23: mapping is deterministic — same reduced-motion input always yields same amplitude', () => {
      const results = Array.from({ length: 10 }, () =>
        mapSignalsToVisuals({
          ...defaultInputs,
          signals: { ...defaultSignals, prefersReducedMotion: true },
        }).motionAmplitude
      );
      const unique = new Set(results);
      expect(unique.size).toBe(1);
    });

    it('T-024-24: no forbidden storage APIs accessed when reading reduced-motion preference', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');

      window.matchMedia = vi.fn((query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })) as unknown as typeof window.matchMedia;

      readSignals();

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

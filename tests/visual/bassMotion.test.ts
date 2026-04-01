import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createParticleField,
  getParticlePositions,
} from '../../src/visual/systems/particleField';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { VisualParams } from '../../src/visual/mappings';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';

const defaultSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  screenWidth: 1024,
  screenHeight: 768,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };

const defaultPointer: PointerState = {
  x: 0.5,
  y: 0.5,
  dx: 0,
  dy: 0,
  speed: 0,
  active: false,
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
};

function createTestCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function computeTotalDisplacement(
  posA: Array<{ x: number; y: number }>,
  posB: Array<{ x: number; y: number }>,
): number {
  let total = 0;
  const len = Math.min(posA.length, posB.length);
  for (let i = 0; i < len; i++) {
    const dx = posA[i].x - posB[i].x;
    const dy = posA[i].y - posB[i].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

describe('US-018: Map bass response to macro motion', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-018-01: bass energy > 0 produces greater particle displacement than bass energy = 0', () => {
    const { ctx } = createTestCanvas();
    const seed = 'bass-displacement-seed';

    // Create two fields with identical initial state
    const fieldNoBass = createParticleField();
    const fieldWithBass = createParticleField();
    const initParams = { ...defaultParams, density: 0.5 };
    fieldNoBass.init(ctx, seed, initParams);
    fieldWithBass.init(ctx, seed, initParams);

    // Accumulate per-frame displacement to avoid toroidal wrapping artifacts
    let cumulativeNoBass = 0;
    let cumulativeWithBass = 0;

    const noBassParams = { ...defaultParams, bassEnergy: 0 };
    const bassParams = { ...defaultParams, bassEnergy: 0.8 };

    let prevNoBass = getParticlePositions(fieldNoBass);
    let prevWithBass = getParticlePositions(fieldWithBass);

    for (let t = 0; t < 5; t++) {
      fieldNoBass.draw(ctx, {
        time: t * 100,
        delta: 16,
        params: noBassParams,
        width: 800,
        height: 600,
      });
      fieldWithBass.draw(ctx, {
        time: t * 100,
        delta: 16,
        params: bassParams,
        width: 800,
        height: 600,
      });

      const curNoBass = getParticlePositions(fieldNoBass);
      const curWithBass = getParticlePositions(fieldWithBass);
      cumulativeNoBass += computeTotalDisplacement(prevNoBass, curNoBass);
      cumulativeWithBass += computeTotalDisplacement(prevWithBass, curWithBass);
      prevNoBass = curNoBass;
      prevWithBass = curWithBass;
    }

    expect(cumulativeWithBass).toBeGreaterThan(cumulativeNoBass);
  });

  it('T-018-02: smoothed bass changes less frame-to-frame than raw bass with jittery input', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };

    // Simulate jittery bass: alternating high and low frequency data
    let frameIndex = 0;
    const jitteryValues = [200, 50, 200, 50, 200, 50, 200, 50];
    const mockPipeline = {
      frequency: new Uint8Array(128),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(() => {
        const val = jitteryValues[frameIndex % jitteryValues.length] ?? 128;
        mockPipeline.frequency.fill(val);
        frameIndex++;
      }),
    };

    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'smooth-test',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => mockPipeline,
    };

    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 8) cb(callCount * 16);
      return callCount;
    });

    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);

    // Collect bassEnergy values across frames
    const bassValues = drawSpy.mock.calls.map(
      (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
    );

    // With smoothing, consecutive frame differences should be smaller
    // than the raw input differences would produce
    // Raw bassToMacro(200) ≈ 0.83, bassToMacro(50) ≈ 0.31 → diff ≈ 0.52
    // Smoothed values should have smaller max consecutive difference
    let maxConsecutiveDiff = 0;
    for (let i = 1; i < bassValues.length; i++) {
      const diff = Math.abs(bassValues[i] - bassValues[i - 1]);
      maxConsecutiveDiff = Math.max(maxConsecutiveDiff, diff);
    }

    // The raw difference would be ~0.52; smoothing should keep it well below that
    expect(maxConsecutiveDiff).toBeLessThan(0.4);
  });

  it('T-018-03: when pipeline reports all-zero frequency data (muted), bassEnergy is still > 0', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };

    // All-zero frequency data simulates muted audio
    const mockPipeline = {
      frequency: new Uint8Array(128).fill(0),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(),
    };

    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'muted-test',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => mockPipeline,
    };

    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 5) cb(callCount * 1000);
      return callCount;
    });

    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);

    // With synthetic bass fallback, at least some frames should have bassEnergy > 0
    const bassValues = drawSpy.mock.calls.map(
      (c: unknown[]) => (c[1] as { params: VisualParams }).params.bassEnergy,
    );

    expect(bassValues.length).toBeGreaterThan(0);
    const anyNonZero = bassValues.some((v: number) => v > 0);
    expect(anyNonZero).toBe(true);
  });

  it('T-018-04: with maximum bass (255), all particle positions remain within 0-1 bounds after many frames', () => {
    const { ctx } = createTestCanvas();
    const field = createParticleField();
    const maxBassParams = { ...defaultParams, bassEnergy: 1.0, density: 0.8 };
    field.init(ctx, 'max-bass-bounds', maxBassParams);

    // Run many frames with maximum bass energy
    for (let t = 0; t < 200; t++) {
      field.draw(ctx, {
        time: t * 100,
        delta: 50,
        params: maxBassParams,
        width: 800,
        height: 600,
      });
    }

    const positions = getParticlePositions(field);
    expect(positions.length).toBeGreaterThan(0);
    positions.forEach((p) => {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    });
  });

  it('T-018-05: bass-driven motion respects prefers-reduced-motion (motionAmplitude=0.2 reduces displacement)', () => {
    const { ctx } = createTestCanvas();
    const seed = 'reduced-motion-bass';

    // Full motion with bass
    const fieldFull = createParticleField();
    const fullParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 1.0 };
    fieldFull.init(ctx, seed, fullParams);
    const initialFull = getParticlePositions(fieldFull);
    for (let t = 0; t < 10; t++) {
      fieldFull.draw(ctx, {
        time: t * 100,
        delta: 16,
        params: fullParams,
        width: 800,
        height: 600,
      });
    }

    // Reduced motion with same bass
    const fieldReduced = createParticleField();
    const reducedParams = { ...defaultParams, bassEnergy: 0.8, motionAmplitude: 0.2 };
    fieldReduced.init(ctx, seed, reducedParams);
    const initialReduced = getParticlePositions(fieldReduced);
    for (let t = 0; t < 10; t++) {
      fieldReduced.draw(ctx, {
        time: t * 100,
        delta: 16,
        params: reducedParams,
        width: 800,
        height: 600,
      });
    }

    const dispFull = computeTotalDisplacement(initialFull, getParticlePositions(fieldFull));
    const dispReduced = computeTotalDisplacement(initialReduced, getParticlePositions(fieldReduced));

    // Reduced motion should produce noticeably less displacement
    expect(dispFull).toBeGreaterThan(dispReduced);
  });

  describe('privacy', () => {
    it('T-018-06: no forbidden storage APIs accessed during bass-driven rendering', () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const cookieGetSpy = vi.spyOn(document, 'cookie', 'get');
      const cookieSetSpy = vi.spyOn(document, 'cookie', 'set');

      const { ctx } = createTestCanvas();
      const field = createParticleField();
      const bassParams = { ...defaultParams, bassEnergy: 0.9 };
      field.init(ctx, 'privacy-bass-seed', bassParams);

      for (let t = 0; t < 20; t++) {
        field.draw(ctx, {
          time: t * 100,
          delta: 16,
          params: bassParams,
          width: 800,
          height: 600,
        });
      }

      // Also test mapping function
      mapSignalsToVisuals({
        signals: defaultSignals,
        geo: defaultGeo,
        pointer: defaultPointer,
        sessionSeed: 'privacy-seed',
        bass: 200,
        treble: 100,
        timeOfDay: 14,
      });

      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
      expect(cookieGetSpy).not.toHaveBeenCalled();
      expect(cookieSetSpy).not.toHaveBeenCalled();
    });
  });
});

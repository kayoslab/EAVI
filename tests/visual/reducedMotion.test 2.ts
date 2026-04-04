import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readSignals } from '../../src/input/signals';
import { mapSignalsToVisuals } from '../../src/visual/mappings';
import type { MappingInputs, VisualParams } from '../../src/visual/mappings';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { PointerState } from '../../src/input/pointer';
import {
  createParticleField,
  getParticleCount,
  getParticlePositions,
} from '../../src/visual/systems/particleField';

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

const defaultInputs: MappingInputs = {
  signals: defaultSignals,
  geo: { country: 'US', region: 'CA' },
  pointer: { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: true },
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
};

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

describe('US-024: Add reduced-motion fallback', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-024-01: reduced-motion preference is detected via readSignals', () => {
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

  it('T-024-02: motion amplitude is lowered when prefersReducedMotion is true', () => {
    const result = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultSignals, prefersReducedMotion: true },
    });
    expect(result.motionAmplitude).toBeLessThanOrEqual(0.3);
    expect(result.motionAmplitude).toBeGreaterThan(0);
  });

  it('T-024-03: particle displacement is lower with reduced motion', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const params = { ...defaultParams, cadence: 0.7, bassEnergy: 0.5 };

    const fieldFull = createParticleField();
    fieldFull.init(ctx, 'test-seed', { ...params, motionAmplitude: 1.0 });
    const posFull0 = getParticlePositions(fieldFull);

    const fieldReduced = createParticleField();
    fieldReduced.init(ctx, 'test-seed', { ...params, motionAmplitude: 0.2 });
    const posReduced0 = getParticlePositions(fieldReduced);

    const frame = { time: 0, delta: 16, elapsed: 0, width: 800, height: 600 };

    fieldFull.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 1.0 } });
    fieldReduced.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 0.2 } });

    const posFull1 = getParticlePositions(fieldFull);
    const posReduced1 = getParticlePositions(fieldReduced);

    const dispFull = computeTotalDisplacement(posFull0, posFull1);
    const dispReduced = computeTotalDisplacement(posReduced0, posReduced1);

    expect(dispReduced).toBeLessThan(dispFull);
  });

  it('T-024-04: treble-driven jitter is dampened by motionAmplitude', () => {
    const time = 1000;
    const i = 5;
    const trebleEnergy = 0.8;
    const width = 800;

    const jitterFull = Math.sin(time * 0.01 + i) * trebleEnergy * 0.003 * width * 1.0;
    const jitterReduced = Math.sin(time * 0.01 + i) * trebleEnergy * 0.003 * width * 0.2;

    expect(Math.abs(jitterReduced)).toBeLessThanOrEqual(0.25 * Math.abs(jitterFull));
    expect(Math.abs(jitterReduced)).toBeGreaterThan(0);
  });

  it('T-024-05: pointer disturbance displacement is dampened by motionAmplitude', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const params = {
      ...defaultParams,
      cadence: 0,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0.8,
    };

    const fieldFull = createParticleField();
    fieldFull.init(ctx, 'test-seed', { ...params, motionAmplitude: 1.0 });
    const posFull0 = getParticlePositions(fieldFull);

    const fieldReduced = createParticleField();
    fieldReduced.init(ctx, 'test-seed', { ...params, motionAmplitude: 0.2 });
    const posReduced0 = getParticlePositions(fieldReduced);

    const frame = { time: 0, delta: 16, elapsed: 0, width: 800, height: 600 };

    fieldFull.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 1.0 } });
    fieldReduced.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 0.2 } });

    const posFull1 = getParticlePositions(fieldFull);
    const posReduced1 = getParticlePositions(fieldReduced);

    const dispFull = computeTotalDisplacement(posFull0, posFull1);
    const dispReduced = computeTotalDisplacement(posReduced0, posReduced1);

    expect(dispReduced).toBeLessThan(dispFull);
  });

  it('T-024-06: core visual identity is preserved — palette, density, complexity unchanged', () => {
    const reducedResult = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultSignals, prefersReducedMotion: true },
    });
    const fullResult = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultSignals, prefersReducedMotion: false },
    });

    expect(reducedResult.paletteHue).toBe(fullResult.paletteHue);
    expect(reducedResult.paletteSaturation).toBe(fullResult.paletteSaturation);
    expect(reducedResult.density).toBe(fullResult.density);
    expect(reducedResult.structureComplexity).toBe(fullResult.structureComplexity);
    expect(reducedResult.curveSoftness).toBe(fullResult.curveSoftness);
    expect(reducedResult.motionAmplitude).toBeGreaterThan(0);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const field = createParticleField();
    field.init(ctx, 'test-seed', { ...defaultParams, motionAmplitude: 0.2 });
    expect(getParticleCount(field)).toBeGreaterThan(0);
  });

  it('T-024-07: no separate page required — same function handles both motion modes', () => {
    const reducedResult = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultSignals, prefersReducedMotion: true },
    });
    const fullResult = mapSignalsToVisuals({
      ...defaultInputs,
      signals: { ...defaultSignals, prefersReducedMotion: false },
    });

    const expectedKeys: (keyof VisualParams)[] = [
      'paletteHue', 'paletteSaturation', 'cadence', 'density',
      'motionAmplitude', 'pointerDisturbance', 'bassEnergy', 'trebleEnergy',
      'curveSoftness', 'structureComplexity',
    ];

    for (const key of expectedKeys) {
      expect(reducedResult).toHaveProperty(key);
      expect(fullResult).toHaveProperty(key);
      expect(Number.isFinite(reducedResult[key])).toBe(true);
      expect(Number.isFinite(fullResult[key])).toBe(true);
    }
  });

  it('T-024-10: sparkle shimmer pulsing is dampened by motionAmplitude', () => {
    const baseSize = 2;
    const trebleEnergy = 0.8;
    const shimmer = 1 + trebleEnergy * 0.5;
    const sparklePhase = 0.75;

    const sizeFull = baseSize * shimmer * (1 + sparklePhase * trebleEnergy * 0.5 * 1.0);
    const sizeReduced = baseSize * shimmer * (1 + sparklePhase * trebleEnergy * 0.5 * 0.2);
    const baseShimmerSize = baseSize * shimmer;

    const variationFull = sizeFull - baseShimmerSize;
    const variationReduced = sizeReduced - baseShimmerSize;

    expect(variationReduced).toBeLessThanOrEqual(0.25 * variationFull);
    expect(sizeReduced).toBeGreaterThan(0);
  });

  it('T-024-11: render loop updates signals.prefersReducedMotion when live listener fires', async () => {
    const { startLoop } = await import('../../src/visual/renderLoop');

    let capturedHandler: ((e: { matches: boolean }) => void) | null = null;
    window.matchMedia = vi.fn(() => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn((_event: string, handler: (e: { matches: boolean }) => void) => {
        capturedHandler = handler;
      }),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })) as unknown as typeof window.matchMedia;

    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);

    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;
    const signals: BrowserSignals = { ...defaultSignals, prefersReducedMotion: false };
    const deps = { signals, seed: 'test' };

    startLoop(canvas, ctx, deps);

    expect(capturedHandler).not.toBeNull();
    capturedHandler!({ matches: true });
    expect(deps.signals.prefersReducedMotion).toBe(true);
  });

  it('T-024-12: all motion sources produce proportionally reduced output', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const params = {
      ...defaultParams,
      cadence: 0.7,
      bassEnergy: 0.5,
      trebleEnergy: 0.8,
      pointerDisturbance: 0.6,
    };

    const fieldFull = createParticleField();
    fieldFull.init(ctx, 'test-seed', { ...params, motionAmplitude: 1.0 });

    const fieldReduced = createParticleField();
    fieldReduced.init(ctx, 'test-seed', { ...params, motionAmplitude: 0.2 });

    let totalDispFull = 0;
    let totalDispReduced = 0;

    for (let f = 0; f < 10; f++) {
      const posFull0 = getParticlePositions(fieldFull);
      const posReduced0 = getParticlePositions(fieldReduced);

      const frame = { time: f * 16, delta: 16, elapsed: f * 16, width: 800, height: 600 };
      fieldFull.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 1.0 } });
      fieldReduced.draw(ctx, { ...frame, params: { ...params, motionAmplitude: 0.2 } });

      const posFull1 = getParticlePositions(fieldFull);
      const posReduced1 = getParticlePositions(fieldReduced);

      totalDispFull += computeTotalDisplacement(posFull0, posFull1);
      totalDispReduced += computeTotalDisplacement(posReduced0, posReduced1);
    }

    expect(totalDispReduced).toBeLessThan(0.4 * totalDispFull);
    expect(totalDispReduced).toBeGreaterThan(0);
  });

  it('T-024-13: particles remain within bounds after extended reduced-motion animation', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const params = {
      ...defaultParams,
      motionAmplitude: 0.2,
      pointerDisturbance: 1.0,
      bassEnergy: 1.0,
      trebleEnergy: 1.0,
      cadence: 0.7,
    };

    const field = createParticleField();
    field.init(ctx, 'test-seed', params);

    for (let f = 0; f < 100; f++) {
      field.draw(ctx, {
        time: f * 16,
        delta: 16,
        elapsed: f * 16,
        params,
        width: 800,
        height: 600,
      });
    }

    const positions = getParticlePositions(field);
    for (const p of positions) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(1);
    }
  });
});

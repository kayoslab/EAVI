import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createParticleField,
  getParticleCount,
  getParticlePositions,
} from '../../src/visual/systems/particleField';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState, GeometrySystem } from '../../src/visual/types';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.3,
  structureComplexity: 0.5,
};

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

function createTestCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

describe('US-009: Scene integration — acceptance criteria', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-US009-AC1: scene parameters are deterministic given the same seed', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const params: VisualParams = { ...defaultParams };

    const fieldA = createParticleField();
    fieldA.init(ctx, 'deterministic-integration', params);
    const posA = getParticlePositions(fieldA);
    const countA = getParticleCount(fieldA);

    const fieldB = createParticleField();
    fieldB.init(ctx, 'deterministic-integration', params);
    const posB = getParticlePositions(fieldB);
    const countB = getParticleCount(fieldB);

    expect(countA).toBe(countB);
    expect(posA).toEqual(posB);
  });

  it('T-US009-AC2: scene parameters differ with different seeds', () => {
    const ctx = document.createElement('canvas').getContext('2d')!;
    const params: VisualParams = { ...defaultParams };

    const fieldA = createParticleField();
    fieldA.init(ctx, 'seed-alpha', params);
    const posA = getParticlePositions(fieldA);

    const fieldB = createParticleField();
    fieldB.init(ctx, 'seed-beta', params);
    const posB = getParticlePositions(fieldB);

    expect(posA).not.toEqual(posB);
  });

  it('T-US009-AC3: at least one geometry system renders to canvas', () => {
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;
    const ctx = canvas.getContext('2d')!;

    const fillRectCalls: Array<[number, number, number, number]> = [];
    const originalFillRect = ctx.fillRect.bind(ctx);
    ctx.fillRect = (x: number, y: number, w: number, h: number) => {
      fillRectCalls.push([x, y, w, h]);
      originalFillRect(x, y, w, h);
    };

    const field = createParticleField();
    const params: VisualParams = { ...defaultParams, density: 0.5 };
    field.init(ctx, 'render-test-seed', params);

    const frame: FrameState = {
      time: 100,
      delta: 16,
      params,
      width: 800,
      height: 600,
    };
    field.draw(ctx, frame);

    // Particle count at density 0.5 should be 300 (0.5 * 600)
    const particleCount = getParticleCount(field);
    expect(particleCount).toBeGreaterThan(0);
    // fillRect should have been called once per particle
    expect(fillRectCalls.length).toBe(particleCount);
  });

  it('T-US009-AC4: render loop continues across multiple frames', () => {
    const drawSpy = vi.fn();
    const initSpy = vi.fn();
    const mockGeo: GeometrySystem = { init: initSpy, draw: drawSpy };
    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'loop-continuity-seed',
      signals: defaultSignals,
      geo: defaultGeo,
    };

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 5) cb(frameCount * 16);
      return frameCount;
    });

    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);

    expect(initSpy).toHaveBeenCalledTimes(1);
    expect(drawSpy).toHaveBeenCalledTimes(5);
    // Verify each frame got increasing time values
    const times = drawSpy.mock.calls.map((c: unknown[]) => (c[1] as FrameState).time);
    for (let i = 1; i < times.length; i++) {
      expect(times[i]).toBeGreaterThan(times[i - 1]);
    }
  });

  it('T-US009-AC5: scene renders with null audio analyser (no audio dependency)', () => {
    const drawSpy = vi.fn();
    const mockGeo: GeometrySystem = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
      geometrySystem: mockGeo,
      seed: 'no-audio-integration',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => null,
    };

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 3) cb(frameCount * 16);
      return frameCount;
    });

    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);

    expect(drawSpy).toHaveBeenCalledTimes(3);
    drawSpy.mock.calls.forEach((call: unknown[]) => {
      const frame = call[1] as FrameState;
      // Bass has synthetic fallback (US-018) so it's >= 0 even without a pipeline
      expect(frame.params.bassEnergy).toBeGreaterThanOrEqual(0);
      expect(frame.params.trebleEnergy).toBe(0);
    });
  });
});

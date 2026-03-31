import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { VisualParams } from '../../src/visual/mappings';

function createTestCanvas(): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = 800;
  canvas.height = 600;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

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

const minimalDeps: LoopDeps = {};

describe('US-009: Render loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-009-18: loop calls requestAnimationFrame recursively', () => {
    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 3) cb(callCount * 16);
      return callCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, minimalDeps);
    expect(callCount).toBeGreaterThan(1);
  });

  it('T-009-19: canvas is cleared each frame', () => {
    const { canvas, ctx } = createTestCanvas();
    const fillRectSpy = vi.spyOn(ctx, 'fillRect');
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 2) cb(frameCount * 16);
      return frameCount;
    });
    startLoop(canvas, ctx, minimalDeps);
    // fillRect is called to clear (full canvas fill with black)
    expect(fillRectSpy).toHaveBeenCalled();
    const fullCanvasFills = fillRectSpy.mock.calls.filter(
      (c) => c[0] === 0 && c[1] === 0 && c[2] === canvas.width && c[3] === canvas.height,
    );
    expect(fullCanvasFills.length).toBeGreaterThanOrEqual(1);
  });

  it('T-009-20: VisualParams are passed through to geometry system', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
      ...minimalDeps,
      geometrySystem: mockGeo,
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
    };
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 1) cb(16);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);
    expect(drawSpy).toHaveBeenCalled();
    const frameState = drawSpy.mock.calls[0][1];
    expect(frameState).toHaveProperty('params');
    expect(frameState.params).toHaveProperty('paletteHue');
    expect(frameState.params).toHaveProperty('density');
  });

  it('T-009-21: loop runs with null/default deps (pre-async resolution)', () => {
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 2) cb(frameCount * 16);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    expect(() => startLoop(canvas, ctx, minimalDeps)).not.toThrow();
    expect(frameCount).toBeGreaterThan(0);
  });

  it('T-009-22: delta time is computed correctly between frames', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
      ...minimalDeps,
      geometrySystem: mockGeo,
      seed: 'delta-seed',
      signals: defaultSignals,
      geo: defaultGeo,
    };
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount === 1) cb(0);
      else if (frameCount === 2) cb(16);
      else if (frameCount === 3) cb(50);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);
    const deltas = drawSpy.mock.calls.map((c: unknown[]) => (c[1] as { delta: number }).delta);
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    expect(deltas[2]).toBeCloseTo(50 - 16, 0);
  });

  it('T-009-23: loop integrates pointer state changes', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const pointerState = {
      x: 100,
      y: 200,
      dx: 5,
      dy: 3,
      speed: 5.83,
      active: true,
    };
    const deps: LoopDeps = {
      ...minimalDeps,
      geometrySystem: mockGeo,
      seed: 'ptr-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      getPointerState: () => pointerState,
    };
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 1) cb(16);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);
    expect(drawSpy).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.pointerDisturbance).toBeGreaterThan(0);
  });

  it('T-009-24: loop integrates audio analyser data when available', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const mockPipeline = {
      frequency: new Uint8Array(128).fill(200),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(),
    };
    const deps: LoopDeps = {
      ...minimalDeps,
      geometrySystem: mockGeo,
      seed: 'audio-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => mockPipeline,
    };
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 1) cb(16);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);
    expect(mockPipeline.poll).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.bassEnergy).toBeGreaterThan(0);
  });

  it('T-009-25: loop renders scene without audio (zero bass/treble when no pipeline)', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
      ...minimalDeps,
      geometrySystem: mockGeo,
      seed: 'no-audio-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      getAnalyserPipeline: () => null,
    };
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 1) cb(16);
      return frameCount;
    });
    const { canvas, ctx } = createTestCanvas();
    startLoop(canvas, ctx, deps);
    expect(drawSpy).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.bassEnergy).toBe(0);
    expect(params.trebleEnergy).toBe(0);
  });

  describe('privacy', () => {
    it('T-009-26: no localStorage or cookie access during render loop', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, minimalDeps);
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

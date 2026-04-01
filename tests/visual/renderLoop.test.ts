import { describe, it, expect, vi, beforeEach } from 'vitest';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';

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

  describe('US-019: Treble smoothing in render loop', () => {
    it('T-019-01: treble energy is smoothed across consecutive frames (spike decays gradually)', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

      // Frame 1: treble spike (high-frequency bins filled)
      // Frame 2+: silence (bins zeroed)
      let frameCount = 0;
      const highTreble = new Uint8Array(128);
      // Fill upper 25% with high values to create treble spike
      for (let i = 96; i < 128; i++) highTreble[i] = 200;
      const silence = new Uint8Array(128).fill(0);

      const mockPipeline = {
        frequency: highTreble,
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(() => {
          // After first frame, switch to silence
          if (frameCount > 1) {
            mockPipeline.frequency = silence;
          }
        }),
      };

      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'smooth-treble-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getAnalyserPipeline: () => mockPipeline,
      };

      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 4) cb(frameCount * 16);
        return frameCount;
      });

      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);

      // Collect trebleEnergy across frames
      const trebleValues = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.trebleEnergy,
      );

      // Frame 1 should have high treble
      expect(trebleValues[0]).toBeGreaterThan(0);

      // After silence frames, treble should still be > 0 due to smoothing
      // (not an instant drop to zero)
      const postSilenceTreble = trebleValues[2]; // 2nd frame after silence
      expect(postSilenceTreble).toBeGreaterThan(0);

      // But it should be decaying (later frames lower than spike frame)
      expect(trebleValues[trebleValues.length - 1]).toBeLessThan(trebleValues[0]);
    });

    it('T-019-02: smoothed treble value stays within 0-1 range', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

      // Max possible treble: all upper-quarter bins at 255
      const maxTreble = new Uint8Array(128);
      for (let i = 96; i < 128; i++) maxTreble[i] = 255;

      const mockPipeline = {
        frequency: maxTreble,
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(),
      };

      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'treble-range-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getAnalyserPipeline: () => mockPipeline,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 5) cb(frameCount * 16);
        return frameCount;
      });

      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);

      drawSpy.mock.calls.forEach((c: unknown[]) => {
        const treble = (c[1] as { params: VisualParams }).params.trebleEnergy;
        expect(treble).toBeGreaterThanOrEqual(0);
        expect(treble).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('US-012: Time-based evolution in render loop', () => {
    it('T-012-17: elapsed time is tracked from first frame and passed in FrameState', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'elapsed-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount === 1) cb(100);
        else if (frameCount === 2) cb(116);
        else if (frameCount === 3) cb(200);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      expect(drawSpy).toHaveBeenCalledTimes(3);
      const elapsed0 = (drawSpy.mock.calls[0][1] as FrameState).elapsed;
      const elapsed1 = (drawSpy.mock.calls[1][1] as FrameState).elapsed;
      const elapsed2 = (drawSpy.mock.calls[2][1] as FrameState).elapsed;
      expect(elapsed0).toBe(0);
      expect(elapsed1).toBe(16);
      expect(elapsed2).toBe(100);
    });

    it('T-012-18: evolveParams is called when seed is available', async () => {
      const evoModule = await import('../../src/visual/evolution');
      const evolveSpy = vi.spyOn(evoModule, 'evolveParams');

      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'evo-call-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      expect(evolveSpy).toHaveBeenCalledTimes(3);
      for (const call of evolveSpy.mock.calls) {
        expect(call[2]).toBe('evo-call-seed');
      }
      evolveSpy.mockRestore();
    });

    it('T-012-19: evolution is skipped in the default-params fallback branch (no seed)', async () => {
      const evoModule = await import('../../src/visual/evolution');
      const evolveSpy = vi.spyOn(evoModule, 'evolveParams');

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, { signals: defaultSignals }); // no seed
      expect(evolveSpy).not.toHaveBeenCalled();
      evolveSpy.mockRestore();
    });

    it('T-012-20: evolved params are passed to geometry.draw instead of raw base params', async () => {
      const evoModule = await import('../../src/visual/evolution');
      const evolveSpy = vi.spyOn(evoModule, 'evolveParams').mockImplementation((base) => ({
        ...base,
        paletteHue: 999,
      }));

      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'evolved-draw-seed',
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
      const frameState = drawSpy.mock.calls[0][1] as FrameState;
      expect(frameState.params.paletteHue).toBe(999);
      evolveSpy.mockRestore();
    });

    it('T-012-21: elapsed time increases monotonically across frames', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'mono-elapsed-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 10) cb(100 + frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      const elapsedValues = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as FrameState).elapsed,
      );
      for (let i = 1; i < elapsedValues.length; i++) {
        expect(elapsedValues[i]).toBeGreaterThan(elapsedValues[i - 1]);
      }
    });
  });

  describe('US-013: Pointer disturbance smoothing in render loop', () => {
    it('T-013-01: pointerDisturbance decays gradually after pointer becomes idle', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      let frameCount = 0;
      const getPointerState = () => {
        if (frameCount <= 1) {
          return { x: 0.5, y: 0.5, dx: 10, dy: 10, speed: 0.1, active: true };
        }
        return { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false };
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'decay-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState,
      };
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 4) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      const values = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.pointerDisturbance,
      );
      expect(values[0]).toBeGreaterThan(0);
      // Frame 2 (idle) should still have non-zero disturbance due to decay
      expect(values[1]).toBeGreaterThan(0);
      // But decaying
      expect(values[1]).toBeLessThan(values[0]);
    });

    it('T-013-02: pointerDisturbance approaches zero after sustained idle period', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      let frameCount = 0;
      const getPointerState = () => {
        if (frameCount <= 1) {
          return { x: 0.5, y: 0.5, dx: 10, dy: 10, speed: 0.1, active: true };
        }
        return { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false };
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'converge-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState,
      };
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 65) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      const lastValue = (drawSpy.mock.calls[drawSpy.mock.calls.length - 1][1] as { params: VisualParams }).params.pointerDisturbance;
      expect(lastValue).toBeLessThan(0.01);
      expect(lastValue).toBeGreaterThanOrEqual(0);
    });

    it('T-013-03: pointerDisturbance ramps up smoothly on pointer movement start', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      let frameCount = 0;
      const getPointerState = () => {
        if (frameCount <= 2) {
          return { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false };
        }
        return { x: 0.5, y: 0.5, dx: 10, dy: 10, speed: 0.1, active: true };
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'ramp-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState,
      };
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 6) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      const values = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.pointerDisturbance,
      );
      // First active frame (index 2) should be > 0
      expect(values[2]).toBeGreaterThan(0);
      // Second active frame should be higher (ramping)
      expect(values[3]).toBeGreaterThan(values[2]);
      // All within bounds
      values.forEach((v) => {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      });
    });

    it('T-013-07: pointer position is threaded through FrameState to geometry system', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'pos-thread-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState: () => ({ x: 0.3, y: 0.7, dx: 0, dy: 0, speed: 0, active: true }),
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
      const frameState = drawSpy.mock.calls[0][1] as FrameState;
      expect(frameState.pointerX).toBe(0.3);
      expect(frameState.pointerY).toBe(0.7);
    });

    it('T-013-08: smoothed pointerDisturbance stays within 0-1 range across all conditions', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      let frameCount = 0;
      const getPointerState = () => {
        // Alternate extreme speed and idle
        if (frameCount % 2 === 0) {
          return { x: 0.5, y: 0.5, dx: 100, dy: 100, speed: 100, active: true };
        }
        return { x: 0.5, y: 0.5, dx: 0, dy: 0, speed: 0, active: false };
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'range-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState,
      };
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 10) cb(frameCount * 16);
        return frameCount;
      });
      const { canvas, ctx } = createTestCanvas();
      startLoop(canvas, ctx, deps);
      drawSpy.mock.calls.forEach((c: unknown[]) => {
        const dist = (c[1] as { params: VisualParams }).params.pointerDisturbance;
        expect(dist).toBeGreaterThanOrEqual(0);
        expect(dist).toBeLessThanOrEqual(1);
      });
    });

    it('T-013-10: touch and mouse both produce non-zero pointerDisturbance in render loop', () => {
      // Mouse-like
      const drawSpy1 = vi.fn();
      const mockGeo1 = { init: vi.fn(), draw: drawSpy1 };
      let fc1 = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        fc1++;
        if (fc1 <= 1) cb(16);
        return fc1;
      });
      const { canvas: c1, ctx: x1 } = createTestCanvas();
      startLoop(c1, x1, {
        geometrySystem: mockGeo1,
        seed: 'touch-mouse-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState: () => ({ x: 0.5, y: 0.5, dx: 5, dy: 5, speed: 0.05, active: true }),
      });
      const mouseVal = (drawSpy1.mock.calls[0][1] as { params: VisualParams }).params.pointerDisturbance;

      // Touch-like (same values — pointer.ts normalizes both)
      const drawSpy2 = vi.fn();
      const mockGeo2 = { init: vi.fn(), draw: drawSpy2 };
      let fc2 = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        fc2++;
        if (fc2 <= 1) cb(16);
        return fc2;
      });
      const { canvas: c2, ctx: x2 } = createTestCanvas();
      startLoop(c2, x2, {
        geometrySystem: mockGeo2,
        seed: 'touch-mouse-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState: () => ({ x: 0.5, y: 0.5, dx: 5, dy: 5, speed: 0.05, active: true }),
      });
      const touchVal = (drawSpy2.mock.calls[0][1] as { params: VisualParams }).params.pointerDisturbance;

      expect(mouseVal).toBeGreaterThan(0);
      expect(touchVal).toBeGreaterThan(0);
      expect(mouseVal).toBe(touchVal);
    });
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

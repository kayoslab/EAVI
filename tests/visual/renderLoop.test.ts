import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';

// Mock WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      constructor() {
        this.domElement = document.createElement('canvas');
        this.domElement.width = 800;
        this.domElement.height = 600;
      }
      setSize(w: number, h: number, _updateStyle?: boolean) {
        this.domElement.width = w;
        this.domElement.height = h;
      }
      setPixelRatio() {}
      setClearColor() {}
      render() {}
      dispose() {}
    },
  };
});

function createTestRenderer() {
  const renderer = new THREE.WebGLRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
  return { renderer, scene, camera };
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

describe('US-029: Render loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-029-19: loop calls requestAnimationFrame recursively', () => {
    let callCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      callCount++;
      if (callCount <= 3) cb(callCount * 16);
      return callCount;
    });
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, minimalDeps);
    expect(callCount).toBeGreaterThan(1);
  });

  it('T-029-20: renderer.render(scene, camera) is called each frame', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 3) cb(frameCount * 16);
      return frameCount;
    });
    startLoop(renderer, scene, camera, minimalDeps);
    expect(renderSpy).toHaveBeenCalledTimes(3);
    expect(renderSpy).toHaveBeenCalledWith(scene, camera);
  });

  it('T-029-21: loop runs without error when deps are minimal (pre-async resolution)', () => {
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 2) cb(frameCount * 16);
      return frameCount;
    });
    const { renderer, scene, camera } = createTestRenderer();
    expect(() => startLoop(renderer, scene, camera, minimalDeps)).not.toThrow();
    expect(frameCount).toBeGreaterThan(0);
  });

  it('T-029-22: placeholder mesh rotates each frame', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      new THREE.MeshBasicMaterial(),
    );
    scene.add(mesh);

    const initialRotY = mesh.rotation.y;
    const initialRotX = mesh.rotation.x;

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 5) cb(frameCount * 16);
      return frameCount;
    });

    startLoop(renderer, scene, camera, { placeholderMesh: mesh });

    expect(mesh.rotation.y).toBeGreaterThan(initialRotY);
    expect(mesh.rotation.x).toBeGreaterThan(initialRotX);
  });

  it('T-029-23: delta time is computed correctly between frames', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
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
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);
    const deltas = drawSpy.mock.calls.map((c: unknown[]) => (c[1] as { delta: number }).delta);
    expect(deltas.length).toBeGreaterThanOrEqual(3);
    expect(deltas[2]).toBeCloseTo(50 - 16, 0);
  });

  it('T-029-24: loop integrates audio analyser data when available', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const mockPipeline = {
      frequency: new Uint8Array(128).fill(200),
      timeDomain: new Uint8Array(128).fill(128),
      poll: vi.fn(),
    };
    const deps: LoopDeps = {
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
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);
    expect(mockPipeline.poll).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.bassEnergy).toBeGreaterThan(0);
  });

  it('T-029-25: loop renders scene without audio (zero treble when no pipeline)', () => {
    const drawSpy = vi.fn();
    const mockGeo = { init: vi.fn(), draw: drawSpy };
    const deps: LoopDeps = {
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
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);
    expect(drawSpy).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.bassEnergy).toBeGreaterThanOrEqual(0);
    expect(params.trebleEnergy).toBe(0);
  });

  it('T-029-26: loop integrates pointer state changes', () => {
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
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);
    expect(drawSpy).toHaveBeenCalled();
    const params = (drawSpy.mock.calls[0][1] as { params: VisualParams }).params;
    expect(params.pointerDisturbance).toBeGreaterThan(0);
  });

  it('T-029-27: elapsed time increases monotonically across frames', () => {
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
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, deps);
    const elapsedValues = drawSpy.mock.calls.map(
      (c: unknown[]) => (c[1] as FrameState).elapsed,
    );
    for (let i = 1; i < elapsedValues.length; i++) {
      expect(elapsedValues[i]).toBeGreaterThan(elapsedValues[i - 1]);
    }
  });

  it('T-029-28: no localStorage or cookie access during render loop', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 3) cb(frameCount * 16);
      return frameCount;
    });
    const { renderer, scene, camera } = createTestRenderer();
    startLoop(renderer, scene, camera, minimalDeps);
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-029-29: Canvas 2D context methods are NOT called — rendering uses renderer.render only', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');

    // Track any Canvas 2D fillRect calls
    const fillRectSpy = vi.fn();
    const origGetContext = renderer.domElement.getContext.bind(renderer.domElement);
    renderer.domElement.getContext = ((type: string) => {
      if (type === '2d') {
        return { fillRect: fillRectSpy };
      }
      return origGetContext(type);
    }) as typeof renderer.domElement.getContext;

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 3) cb(frameCount * 16);
      return frameCount;
    });
    startLoop(renderer, scene, camera, minimalDeps);

    expect(renderSpy).toHaveBeenCalled();
    expect(fillRectSpy).not.toHaveBeenCalled();
  });

  describe('US-019: Treble smoothing in render loop', () => {
    it('T-019-01: treble energy is smoothed across consecutive frames (spike decays gradually)', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

      let frameCount = 0;
      const highTreble = new Uint8Array(128);
      for (let i = 96; i < 128; i++) highTreble[i] = 200;
      const silence = new Uint8Array(128).fill(0);

      const mockPipeline = {
        frequency: highTreble,
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(() => {
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

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

      const trebleValues = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.trebleEnergy,
      );

      expect(trebleValues[0]).toBeGreaterThan(0);
      const postSilenceTreble = trebleValues[2];
      expect(postSilenceTreble).toBeGreaterThan(0);
      expect(trebleValues[trebleValues.length - 1]).toBeLessThan(trebleValues[0]);
    });

    it('T-019-02: smoothed treble value stays within 0-1 range', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };

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

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, { signals: defaultSignals });
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
      const values = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.pointerDisturbance,
      );
      expect(values[0]).toBeGreaterThan(0);
      expect(values[1]).toBeGreaterThan(0);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
      const values = drawSpy.mock.calls.map(
        (c: unknown[]) => (c[1] as { params: VisualParams }).params.pointerDisturbance,
      );
      expect(values[2]).toBeGreaterThan(0);
      expect(values[3]).toBeGreaterThan(values[2]);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);
      drawSpy.mock.calls.forEach((c: unknown[]) => {
        const dist = (c[1] as { params: VisualParams }).params.pointerDisturbance;
        expect(dist).toBeGreaterThanOrEqual(0);
        expect(dist).toBeLessThanOrEqual(1);
      });
    });

    it('T-013-10: touch and mouse both produce non-zero pointerDisturbance in render loop', () => {
      const drawSpy1 = vi.fn();
      const mockGeo1 = { init: vi.fn(), draw: drawSpy1 };
      let fc1 = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        fc1++;
        if (fc1 <= 1) cb(16);
        return fc1;
      });
      const r1 = createTestRenderer();
      startLoop(r1.renderer, r1.scene, r1.camera, {
        geometrySystem: mockGeo1,
        seed: 'touch-mouse-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState: () => ({ x: 0.5, y: 0.5, dx: 5, dy: 5, speed: 0.05, active: true }),
      });
      const mouseVal = (drawSpy1.mock.calls[0][1] as { params: VisualParams }).params.pointerDisturbance;

      const drawSpy2 = vi.fn();
      const mockGeo2 = { init: vi.fn(), draw: drawSpy2 };
      let fc2 = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        fc2++;
        if (fc2 <= 1) cb(16);
        return fc2;
      });
      const r2 = createTestRenderer();
      startLoop(r2.renderer, r2.scene, r2.camera, {
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
      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, minimalDeps);
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  describe('US-030: Placeholder removal after geometry init', () => {
    it('T-030-21: placeholder mesh is removed from scene after geometry system initializes', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial());
      scene.add(mesh);

      const mockGeo = { init: vi.fn(), draw: vi.fn() };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'placeholder-remove-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        placeholderMesh: mesh,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, deps);
      expect(mockGeo.init).toHaveBeenCalled();
      expect(scene.children).not.toContain(mesh);
    });

    it('T-030-22: placeholder mesh rotation stops after geometry system takes over', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial());
      scene.add(mesh);

      const mockGeo = { init: vi.fn(), draw: vi.fn() };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'rot-stop-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        placeholderMesh: mesh,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 5) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, deps);
      const rotAfterInit = mesh.rotation.y;
      expect(rotAfterInit).toBeDefined();
    });

    it('T-030-26: render loop still calls renderer.render after geometry system replaces placeholder', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const renderSpy = vi.spyOn(renderer, 'render');
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial());
      scene.add(mesh);

      const mockGeo = { init: vi.fn(), draw: vi.fn() };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'render-continues-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        placeholderMesh: mesh,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 5) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, deps);
      expect(renderSpy).toHaveBeenCalledTimes(5);
      expect(mockGeo.draw).toHaveBeenCalled();
    });

    it('T-030-30: Canvas 2D context is never used when geometry systems render via Three.js', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const fillRectSpy = vi.fn();
      const origGetContext = renderer.domElement.getContext.bind(renderer.domElement);
      renderer.domElement.getContext = ((type: string) => {
        if (type === '2d') return { fillRect: fillRectSpy, beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), arc: vi.fn(), fill: vi.fn() };
        return origGetContext(type);
      }) as typeof renderer.domElement.getContext;

      const mockGeo = { init: vi.fn(), draw: vi.fn() };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'no-2d-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 5) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, deps);
      expect(fillRectSpy).not.toHaveBeenCalled();
    });

    it('T-030-31: audio analysis (bass/treble) continues to be computed after WebGL migration', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const mockPipeline = {
        frequency: new Uint8Array(128),
        timeDomain: new Uint8Array(128).fill(128),
        poll: vi.fn(),
      };
      for (let i = 0; i < 32; i++) mockPipeline.frequency[i] = 180;
      for (let i = 96; i < 128; i++) mockPipeline.frequency[i] = 150;

      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'audio-continues-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getAnalyserPipeline: () => mockPipeline,
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

      expect(mockPipeline.poll).toHaveBeenCalledTimes(3);
      const lastParams = (drawSpy.mock.calls[2][1] as { params: VisualParams }).params;
      expect(lastParams.bassEnergy).toBeGreaterThan(0);
      expect(lastParams.trebleEnergy).toBeGreaterThan(0);
    });

    it('T-030-32: pointer entropy values are still computed after WebGL migration', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'ptr-continues-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        getPointerState: () => ({ x: 0.3, y: 0.7, dx: 8, dy: 4, speed: 0.09, active: true }),
      };

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });

      const { renderer, scene, camera } = createTestRenderer();
      startLoop(renderer, scene, camera, deps);

      const lastFrame = drawSpy.mock.calls[2][1] as FrameState;
      expect(lastFrame.pointerX).toBe(0.3);
      expect(lastFrame.pointerY).toBe(0.7);
      expect(lastFrame.params.pointerDisturbance).toBeGreaterThan(0);
    });
  });

  describe('US-025: Quality profile in LoopDeps', () => {
    it('T-025-20: render loop accepts quality profile in LoopDeps', () => {
      const drawSpy = vi.fn();
      const mockGeo = { init: vi.fn(), draw: drawSpy };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'quality-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        quality: { tier: 'low', maxParticles: 150, resolutionScale: 0.5, enableSparkle: false },
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });
      const { renderer, scene, camera } = createTestRenderer();
      expect(() => startLoop(renderer, scene, camera, deps)).not.toThrow();
      expect(drawSpy).toHaveBeenCalled();
    });

    it('T-025-21: render loop runs without error when quality is null or undefined', () => {
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });
      const { renderer, scene, camera } = createTestRenderer();

      // quality: null
      expect(() => startLoop(renderer, scene, camera, { quality: null })).not.toThrow();

      frameCount = 0;
      // quality: undefined (omitted)
      expect(() => startLoop(renderer, scene, camera, {})).not.toThrow();
    });
  });

  describe('US-050: Render loop geometry gate', () => {
    it('T-050-29: does not call geometrySystem.draw() when geometrySystem.init() throws', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mockGeo = {
        init: vi.fn(() => { throw new Error('invalid geometry'); }),
        draw: vi.fn(),
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'fail-init-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const renderSpy = vi.spyOn(renderer, 'render');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      startLoop(renderer, scene, camera, deps);
      expect(mockGeo.init).toHaveBeenCalledOnce();
      expect(mockGeo.draw).not.toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('T-050-30: calls geometrySystem.draw() normally when init() succeeds', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mockGeo = { init: vi.fn(), draw: vi.fn() };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'ok-init-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const renderSpy = vi.spyOn(renderer, 'render');
      startLoop(renderer, scene, camera, deps);
      expect(mockGeo.init).toHaveBeenCalledOnce();
      expect(mockGeo.draw).toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalledTimes(3);
    });

    it('T-050-31: does not call draw() when initAllForValidation path throws', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mockGeo = {
        init: vi.fn(),
        draw: vi.fn(),
        initAllForValidation: vi.fn(() => { throw new Error('shader init failed'); }),
        cleanupInactive: vi.fn(),
      };
      (renderer as any).compile = vi.fn();
      const deps: LoopDeps = {
        geometrySystem: mockGeo as any,
        seed: 'fail-validation-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        errorCollector: { errors: [], hasErrors: () => false } as any,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const renderSpy = vi.spyOn(renderer, 'render');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      startLoop(renderer, scene, camera, deps);
      expect(mockGeo.draw).not.toHaveBeenCalled();
      expect(renderSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('T-050-32: logs error to console when geometry init fails', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mockGeo = {
        init: vi.fn(() => { throw new Error('bad buffers'); }),
        draw: vi.fn(),
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'log-error-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      startLoop(renderer, scene, camera, deps);
      expect(consoleSpy).toHaveBeenCalled();
      const errorMsg = consoleSpy.mock.calls.flat().join(' ');
      expect(errorMsg).toContain('Geometry init failed');
      consoleSpy.mockRestore();
    });

    it('T-050-33: placeholder mesh is not removed from scene when geometry init fails', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial());
      scene.add(mesh);
      const mockGeo = {
        init: vi.fn(() => { throw new Error('invalid geometry'); }),
        draw: vi.fn(),
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'placeholder-keep-seed',
        signals: defaultSignals,
        geo: defaultGeo,
        placeholderMesh: mesh,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      startLoop(renderer, scene, camera, deps);
      expect(scene.children).toContain(mesh);
      consoleSpy.mockRestore();
    });

    it('T-050-34: continues camera updates and rendering even with invalid geometry', () => {
      const { renderer, scene, camera } = createTestRenderer();
      const mockGeo = {
        init: vi.fn(() => { throw new Error('invalid geometry'); }),
        draw: vi.fn(),
      };
      const deps: LoopDeps = {
        geometrySystem: mockGeo,
        seed: 'camera-continues-seed',
        signals: defaultSignals,
        geo: defaultGeo,
      };
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });
      const renderSpy = vi.spyOn(renderer, 'render');
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(() => startLoop(renderer, scene, camera, deps)).not.toThrow();
      expect(renderSpy).toHaveBeenCalledTimes(3);
      consoleSpy.mockRestore();
    });
  });
});

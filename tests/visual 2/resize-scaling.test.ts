import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { attachResizeHandler } from '../../src/visual/resize';

// Mock Three.js WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _w = 0;
      private _h = 0;
      private _pixelRatio = 1;
      setSizeCalls: Array<[number, number, boolean | undefined]> = [];
      setPixelRatioCalls: number[] = [];

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number, updateStyle?: boolean) {
        this.setSizeCalls.push([w, h, updateStyle]);
        this._w = w;
        this._h = h;
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
        if (updateStyle !== false) {
          this.domElement.style.width = w + 'px';
          this.domElement.style.height = h + 'px';
        }
      }

      setPixelRatio(ratio: number) {
        this.setPixelRatioCalls.push(ratio);
        this._pixelRatio = ratio;
      }

      getPixelRatio() {
        return this._pixelRatio;
      }

      setClearColor() {}
      getClearColor(target: actual.Color) { target.setRGB(0, 0, 0); return target; }
      render() {}
      dispose() {}
      getSize(target: actual.Vector2) {
        target.set(this._w, this._h);
        return target;
      }
    },
  };
});

function createRendererAndCamera() {
  const renderer = new THREE.WebGLRenderer() as THREE.WebGLRenderer & {
    setSizeCalls: Array<[number, number, boolean | undefined]>;
    setPixelRatioCalls: number[];
  };
  renderer.setSize(1920, 1080, false);
  const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);
  return { renderer, camera };
}

describe('US-045: Resize handler uses updateStyle=false and scales via pixel ratio', () => {
  let savedVV: VisualViewport | null;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    savedVV = window.visualViewport;
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', { value: savedVV, configurable: true });
  });

  it('T-045-01: attachResizeHandler calls renderer.setSize with updateStyle=false on resize', () => {
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    // Clear initial calls
    renderer.setSizeCalls.length = 0;

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(renderer.setSizeCalls.length).toBeGreaterThanOrEqual(1);
    const lastCall = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
    expect(lastCall[0]).toBe(1024);
    expect(lastCall[1]).toBe(768);
    expect(lastCall[2]).toBe(false);
  });

  it('T-045-02: attachResizeHandler calls setPixelRatio with Math.min(dpr, 2) * resolutionScale on resize', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera, 0.5);

    renderer.setPixelRatioCalls.length = 0;

    window.dispatchEvent(new Event('resize'));

    expect(renderer.setPixelRatioCalls.length).toBeGreaterThanOrEqual(1);
    const lastRatio = renderer.setPixelRatioCalls[renderer.setPixelRatioCalls.length - 1];
    // Math.min(3, 2) * 0.5 = 1.0
    expect(lastRatio).toBe(1.0);
  });

  it('T-045-03: resize handler does not set inline style.width or style.height on canvas', () => {
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    // Clear any inline styles that might exist
    renderer.domElement.style.width = '';
    renderer.domElement.style.height = '';

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });

  it('T-045-04: orientationchange event triggers resize handler and updates camera', () => {
    const { renderer, camera } = createRendererAndCamera();
    const projSpy = vi.spyOn(camera, 'updateProjectionMatrix');
    attachResizeHandler(renderer, camera);

    renderer.setSizeCalls.length = 0;
    projSpy.mockClear();

    // Simulate rotation from landscape to portrait
    Object.defineProperty(window, 'innerWidth', { value: 768, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });
    window.dispatchEvent(new Event('orientationchange'));

    expect(camera.aspect).toBe(768 / 1024);
    expect(projSpy).toHaveBeenCalled();
    const lastCall = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
    expect(lastCall[0]).toBe(768);
    expect(lastCall[1]).toBe(1024);
    expect(lastCall[2]).toBe(false);
  });

  it('T-045-05: visualViewport resize event triggers resize handler', () => {
    const listeners: Array<() => void> = [];
    const mockVV = {
      width: 1920,
      height: 1080,
      addEventListener: (_event: string, fn: () => void) => { listeners.push(fn); },
      removeEventListener: (_event: string, _fn: () => void) => {
        const idx = listeners.indexOf(_fn);
        if (idx >= 0) listeners.splice(idx, 1);
      },
    };
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true });

    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    renderer.setSizeCalls.length = 0;

    mockVV.width = 800;
    mockVV.height = 600;
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    for (const fn of listeners) fn();

    expect(renderer.setSizeCalls.length).toBeGreaterThanOrEqual(1);
    const lastCall = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
    expect(lastCall[2]).toBe(false);
  });

  it('T-045-06: cleanup function removes all three event listeners (resize, orientationchange, visualViewport)', () => {
    const listeners: Array<() => void> = [];
    const removed: Array<() => void> = [];
    const mockVV = {
      width: 1920,
      height: 1080,
      addEventListener: (_event: string, fn: () => void) => { listeners.push(fn); },
      removeEventListener: (_event: string, fn: () => void) => { removed.push(fn); },
    };
    Object.defineProperty(window, 'visualViewport', { value: mockVV, configurable: true });

    const { renderer, camera } = createRendererAndCamera();
    const cleanup = attachResizeHandler(renderer, camera);

    renderer.setSizeCalls.length = 0;

    cleanup();

    Object.defineProperty(window, 'innerWidth', { value: 640, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 480, configurable: true });
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));

    // After cleanup, no new setSize calls
    expect(renderer.setSizeCalls.length).toBe(0);
  });

  it('T-045-07: resize handler with resolutionScale=1.0 on high-DPR device does not shrink canvas CSS', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera, 1.0);

    renderer.setSizeCalls.length = 0;
    renderer.setPixelRatioCalls.length = 0;
    renderer.domElement.style.width = '';
    renderer.domElement.style.height = '';

    window.dispatchEvent(new Event('resize'));

    // DPR capped at 2
    const lastRatio = renderer.setPixelRatioCalls[renderer.setPixelRatioCalls.length - 1];
    expect(lastRatio).toBe(2.0);

    // Full viewport dimensions with updateStyle=false
    const lastCall = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
    expect(lastCall[0]).toBe(1920);
    expect(lastCall[1]).toBe(1080);
    expect(lastCall[2]).toBe(false);

    // No inline CSS
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });

  it('T-045-08: resize handler with resolutionScale=0.5 reduces pixel ratio but not CSS size', () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });

    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera, 0.5);

    renderer.setSizeCalls.length = 0;
    renderer.setPixelRatioCalls.length = 0;
    renderer.domElement.style.width = '';
    renderer.domElement.style.height = '';

    window.dispatchEvent(new Event('resize'));

    // min(2,2) * 0.5 = 1.0
    const lastRatio = renderer.setPixelRatioCalls[renderer.setPixelRatioCalls.length - 1];
    expect(lastRatio).toBe(1.0);

    // Full viewport dimensions
    const lastCall = renderer.setSizeCalls[renderer.setSizeCalls.length - 1];
    expect(lastCall[0]).toBe(390);
    expect(lastCall[1]).toBe(844);
    expect(lastCall[2]).toBe(false);

    // No inline CSS
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });
});

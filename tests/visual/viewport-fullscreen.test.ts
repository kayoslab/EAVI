import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock Three.js WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _pixelRatio = 1;
      setSizeCalls: Array<[number, number, boolean | undefined]> = [];
      setPixelRatioCalls: number[] = [];

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number, updateStyle?: boolean) {
        this.setSizeCalls.push([w, h, updateStyle]);
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
        target.set(this.domElement.width / this._pixelRatio, this.domElement.height / this._pixelRatio);
        return target;
      }
    },
  };
});

type TrackedRenderer = THREE.WebGLRenderer & {
  setSizeCalls: Array<[number, number, boolean | undefined]>;
  setPixelRatioCalls: number[];
};

describe('US-045: Canvas always fills viewport with no black bars', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-045-14: CSS stylesheet contains canvas rule with 100% !important for width and height', () => {
    const cssPath = resolve(__dirname, '../../src/style.css');
    const css = readFileSync(cssPath, 'utf-8');
    expect(css).toMatch(/canvas\s*\{[^}]*width:\s*100%\s*!important/);
    expect(css).toMatch(/canvas\s*\{[^}]*height:\s*100%\s*!important/);
  });

  it('T-045-15: canvas CSS dimensions fill viewport at all quality tiers (0.5, 0.75, 1.0)', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const scales = [0.5, 0.75, 1.0];

    for (const scale of scales) {
      const container = document.createElement('div');
      document.body.appendChild(container);
      const { renderer } = initScene(container, { resolutionScale: scale });

      // No inline styles — CSS stylesheet handles layout
      expect(renderer.domElement.style.width).toBe('');
      expect(renderer.domElement.style.height).toBe('');
      // Canvas is child of container
      expect(container.contains(renderer.domElement)).toBe(true);

      renderer.dispose();
      document.body.removeChild(container);
    }
  });

  it('T-045-16: iPhone SE viewport simulation: no black bars after quality scaling', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });
    const tracked = renderer as TrackedRenderer;

    const setSizeCall = tracked.setSizeCalls.find(
      ([w, h]) => w === 375 && h === 667,
    );
    expect(setSizeCall).toBeDefined();
    expect(setSizeCall![2]).toBe(false);

    // min(2,2) * 0.5 = 1.0
    expect(tracked.setPixelRatioCalls).toContain(1.0);

    // No inline CSS
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });

  it('T-045-17: iPad Pro viewport simulation: no black bars after orientation change', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1366, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });

    const { initScene } = await import('../../src/visual/scene');
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const container = document.createElement('div');
    const { renderer, camera } = initScene(container);
    const tracked = renderer as TrackedRenderer;
    attachResizeHandler(renderer, camera);

    // Simulate rotation to landscape
    Object.defineProperty(window, 'innerWidth', { value: 1366, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1024, configurable: true });

    tracked.setSizeCalls.length = 0;

    window.dispatchEvent(new Event('orientationchange'));

    expect(camera.aspect).toBeCloseTo(1366 / 1024);

    const lastCall = tracked.setSizeCalls[tracked.setSizeCalls.length - 1];
    expect(lastCall[0]).toBe(1366);
    expect(lastCall[1]).toBe(1024);
    expect(lastCall[2]).toBe(false);

    // No inline CSS
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });
});

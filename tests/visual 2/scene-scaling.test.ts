import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock Three.js WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _clearColor = new actual.Color(0x000000);
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

      setClearColor(color: number | string | actual.Color) {
        if (typeof color === 'number') {
          this._clearColor.setHex(color);
        }
      }

      getClearColor(target: actual.Color) {
        target.copy(this._clearColor);
        return target;
      }

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

describe('US-045: Scene initialization scaling', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-045-09: initScene calls renderer.setSize with updateStyle=false', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);
    const tracked = renderer as TrackedRenderer;

    const setSizeCall = tracked.setSizeCalls.find(
      ([w, h]) => w === 1920 && h === 1080,
    );
    expect(setSizeCall).toBeDefined();
    expect(setSizeCall![2]).toBe(false);
  });

  it('T-045-10: initScene does not set inline style.width or style.height on canvas', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);

    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });

  it('T-045-11: initScene with resolutionScale applies it to setPixelRatio without affecting CSS', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.75 });
    const tracked = renderer as TrackedRenderer;

    // min(2, 2) * 0.75 = 1.5
    expect(tracked.setPixelRatioCalls).toContain(1.5);
    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });

  it('T-045-12: context restore re-applies pixel ratio and setSize with updateStyle=false', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });
    const tracked = renderer as TrackedRenderer;

    // Clear tracking
    tracked.setSizeCalls.length = 0;
    tracked.setPixelRatioCalls.length = 0;

    // Dispatch context restored
    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));

    // setPixelRatio should be called with min(2,2)*0.5 = 1.0
    expect(tracked.setPixelRatioCalls).toContain(1.0);

    // setSize should be called with updateStyle=false
    const setSizeCall = tracked.setSizeCalls.find(
      ([w, h]) => w === 1920 && h === 1080,
    );
    expect(setSizeCall).toBeDefined();
    expect(setSizeCall![2]).toBe(false);
  });

  it('T-045-13: context restore does not set inline style on canvas', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);

    // Ensure clean state
    renderer.domElement.style.width = '';
    renderer.domElement.style.height = '';

    renderer.domElement.dispatchEvent(new Event('webglcontextrestored'));

    expect(renderer.domElement.style.width).toBe('');
    expect(renderer.domElement.style.height).toBe('');
  });
});

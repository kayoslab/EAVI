import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';

// Mock Three.js WebGLRenderer since jsdom has no WebGL
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _clearColor = new actual.Color(0x000000);
      private _pixelRatio = 1;

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number) {
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
      }

      setPixelRatio(ratio: number) {
        this._pixelRatio = ratio;
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

describe('US-029: Three.js scene bootstrap', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  it('T-029-01: initScene creates a WebGLRenderer and appends its canvas to the container', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);

    expect(container.children.length).toBe(1);
    expect(container.children[0]).toBe(renderer.domElement);
    expect(renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
  });

  it('T-029-02: initScene returns an object with renderer, scene, and camera properties', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const result = initScene(container);

    expect(result.renderer).toBeDefined();
    expect(result.scene).toBeDefined();
    expect(result.camera).toBeDefined();
    expect(result.scene).toBeInstanceOf(THREE.Scene);
    expect(result.camera).toBeInstanceOf(THREE.PerspectiveCamera);
  });

  it('T-029-03: renderer is sized to window dimensions on creation', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);

    // Pixel ratio clamped to min(2, devicePixelRatio) = 2
    expect(renderer.domElement.width).toBe(1920 * 2);
    expect(renderer.domElement.height).toBe(1080 * 2);
  });

  it('T-029-04: camera has correct aspect ratio matching window dimensions', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { camera } = initScene(container);

    expect(camera.aspect).toBe(1920 / 1080);
  });

  it('T-029-05: camera is positioned at z=5 looking at the origin', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { camera } = initScene(container);

    expect(camera.position.z).toBe(5);
    expect(camera.position.x).toBe(0);
    expect(camera.position.y).toBe(0);
  });

  it('T-029-06: scene background is set to black (0x000000)', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { scene } = initScene(container);

    expect(scene.background).toBeInstanceOf(THREE.Color);
    const bg = scene.background as THREE.Color;
    expect(bg.r).toBe(0);
    expect(bg.g).toBe(0);
    expect(bg.b).toBe(0);
  });

  it('T-029-07: renderer clear color is black', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container);

    const clearColor = new THREE.Color();
    renderer.getClearColor(clearColor);
    expect(clearColor.r).toBe(0);
    expect(clearColor.g).toBe(0);
    expect(clearColor.b).toBe(0);
  });
});

describe('US-025: Scene quality scaling', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
  });

  it('T-025-09: initScene accepts resolutionScale parameter and applies it to pixel ratio', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.75 });

    // Pixel ratio = min(2, 2) * 0.75 = 1.5, canvas = 1920 * 1.5 x 1080 * 1.5
    expect(renderer.domElement.width).toBe(1920 * 1.5);
    expect(renderer.domElement.height).toBe(1080 * 1.5);
  });

  it('T-025-10: initScene with resolutionScale 0.5 halves effective resolution', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });

    // Pixel ratio = min(2, 2) * 0.5 = 1.0, canvas = 1920 * 1 x 1080 * 1
    expect(renderer.domElement.width).toBe(1920);
    expect(renderer.domElement.height).toBe(1080);
  });

  it('T-025-11: initScene with disableAntialias flag creates renderer without antialias', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    // disableAntialias is passed to renderer constructor — we verify it doesn't throw
    // and still produces a valid renderer
    const { renderer } = initScene(container, { disableAntialias: true });
    expect(renderer).toBeDefined();
    expect(renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
  });
});

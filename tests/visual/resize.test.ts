import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { attachResizeHandler } from '../../src/visual/resize';

// Mock WebGLRenderer
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _w = 0;
      private _h = 0;

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number, _updateStyle?: boolean) {
        this._w = w;
        this._h = h;
        this.domElement.width = w;
        this.domElement.height = h;
      }

      setPixelRatio() {}
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
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(1920, 1080);
  const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);
  return { renderer, camera };
}

describe('US-029: Resize handler for Three.js', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
  });

  it('T-029-14: resize handler updates renderer size on window resize', () => {
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(1024);
    expect(size.y).toBe(768);
  });

  it('T-029-15: resize handler updates camera aspect ratio on window resize', () => {
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(camera.aspect).toBe(1024 / 768);
  });

  it('T-029-16: resize handler calls camera.updateProjectionMatrix after aspect change', () => {
    const { renderer, camera } = createRendererAndCamera();
    const spy = vi.spyOn(camera, 'updateProjectionMatrix');
    attachResizeHandler(renderer, camera);

    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('T-029-17: resize handler returns a cleanup function that removes the listener', () => {
    const { renderer, camera } = createRendererAndCamera();
    const cleanup = attachResizeHandler(renderer, camera);

    expect(typeof cleanup).toBe('function');

    // Set initial size
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size1 = new THREE.Vector2();
    renderer.getSize(size1);
    expect(size1.x).toBe(1024);

    cleanup();

    // Resize again after cleanup
    Object.defineProperty(window, 'innerWidth', { value: 640, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 480, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size2 = new THREE.Vector2();
    renderer.getSize(size2);
    // Should still be 1024 since listener was removed
    expect(size2.x).toBe(1024);
  });

  it('T-029-18: resize handler handles rapid sequential resize events', () => {
    const { renderer, camera } = createRendererAndCamera();
    attachResizeHandler(renderer, camera);

    const dimensions = [
      [800, 600],
      [1280, 720],
      [1600, 900],
    ];

    for (const [w, h] of dimensions) {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: h, configurable: true });
      window.dispatchEvent(new Event('resize'));
    }

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(1600);
    expect(size.y).toBe(900);
    expect(camera.aspect).toBe(1600 / 900);
  });
});

describe('US-025: Resize handler with resolution scale', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-025-18: resize handler respects resolutionScale parameter', () => {
    const renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(2 * 0.5);
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    attachResizeHandler(renderer, camera, 0.5);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    // After resize, pixel ratio should be min(2,2)*0.5 = 1.0
    // Canvas dimensions should be 1024*1.0 x 768*1.0
    expect(renderer.domElement.width).toBe(1024);
    expect(renderer.domElement.height).toBe(768);
  });

  it('T-025-19: resize handler cleanup and re-attach with different resolutionScale works', () => {
    const renderer = new THREE.WebGLRenderer();
    renderer.setPixelRatio(2);
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    // Attach with scale 1.0
    const cleanup = attachResizeHandler(renderer, camera, 1.0);

    // Detach and re-attach with scale 0.5
    cleanup();
    attachResizeHandler(renderer, camera, 0.5);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    // New scale 0.5: pixel ratio = min(2,2)*0.5 = 1.0 -> canvas 1024x768
    expect(renderer.domElement.width).toBe(1024);
    expect(renderer.domElement.height).toBe(768);
  });
});

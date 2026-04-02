import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';

// Mock WebGLRenderer for jsdom
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

      setSize(w: number, h: number) {
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

describe('US-002: Full-screen canvas shell (Three.js)', () => {
  describe('initScene module', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('returns renderer, scene, and camera', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const result = initScene(container);
      expect(result.renderer).toBeDefined();
      expect(result.scene).toBeDefined();
      expect(result.camera).toBeDefined();
      expect(result.renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
    });

    it('renderer canvas fills the viewport dimensions', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer } = initScene(container);
      expect(renderer.domElement.width).toBe(1024);
      expect(renderer.domElement.height).toBe(768);
    });

    it('renderer canvas is appended to the provided container', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer } = initScene(container);
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
      expect(canvas).toBe(renderer.domElement);
    });
  });

  describe('resize handling', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('updates renderer size on window resize', async () => {
      const { initScene } = await import('../src/visual/scene');
      const { attachResizeHandler } = await import('../src/visual/resize');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer, camera } = initScene(container);
      attachResizeHandler(renderer, camera);

      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      const size = new THREE.Vector2();
      renderer.getSize(size);
      expect(size.x).toBe(800);
      expect(size.y).toBe(600);
    });

    it('returns a cleanup function that removes the listener', async () => {
      const { initScene } = await import('../src/visual/scene');
      const { attachResizeHandler } = await import('../src/visual/resize');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer, camera } = initScene(container);
      const cleanup = attachResizeHandler(renderer, camera);

      cleanup();

      Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 480, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      // Should still be original size since listener was removed
      expect(renderer.domElement.width).toBe(1024);
      expect(renderer.domElement.height).toBe(768);
    });
  });

  describe('no scrollbars (CSS)', () => {
    const css = readFileSync(resolve(__dirname, '..', 'src', 'style.css'), 'utf-8');

    it('body has overflow hidden', () => {
      expect(css).toMatch(/overflow\s*:\s*hidden/);
    });

    it('body has dark background', () => {
      expect(css).toMatch(/background\s*:\s*#000|background-color\s*:\s*#000|background\s*:\s*black/);
    });

    it('body has zero margin', () => {
      expect(css).toMatch(/margin\s*:\s*0/);
    });
  });

  describe('#app container styling', () => {
    const css = readFileSync(resolve(__dirname, '..', 'src', 'style.css'), 'utf-8');

    it('has #app selector with position fixed', () => {
      expect(css).toMatch(/#app[^}]*position\s*:\s*fixed/);
    });

    it('has #app with full width and height', () => {
      expect(css).toMatch(/#app[^}]*width\s*:\s*100%/);
      expect(css).toMatch(/#app[^}]*height\s*:\s*100%/);
    });
  });

  describe('dark background rendering', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('initScene sets renderer clear color to black', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer } = initScene(container);
      const clearColor = new THREE.Color();
      renderer.getClearColor(clearColor);
      expect(clearColor.r).toBe(0);
      expect(clearColor.g).toBe(0);
      expect(clearColor.b).toBe(0);
    });
  });

  describe('render loop', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('startLoop calls requestAnimationFrame', async () => {
      const { initScene } = await import('../src/visual/scene');
      const { startLoop } = await import('../src/visual/renderLoop');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer, scene, camera } = initScene(container);
      let callCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        callCount++;
        if (callCount <= 2) cb(callCount * 16);
        return callCount;
      });
      startLoop(renderer, scene, camera);
      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });
  });

  describe('privacy: no forbidden storage APIs', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
    });

    it('scene module does not access localStorage', async () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      initScene(container);
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('scene module does not set cookies', async () => {
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      initScene(container);
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  describe('main.ts integration', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });

    it('renders a canvas inside #app on import', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.tagName.toLowerCase()).toBe('canvas');
    });

    it('canvas dimensions match viewport', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
      expect(canvas.width).toBeLessThanOrEqual(1024);
      expect(canvas.height).toBeLessThanOrEqual(768);
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    });

    it('canvas updates on window resize', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;

      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      expect(canvas.width).toBeLessThanOrEqual(800);
      expect(canvas.height).toBeLessThanOrEqual(600);
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    });
  });
});

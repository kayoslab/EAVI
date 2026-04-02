import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import * as THREE from 'three';

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
        this.domElement.style.display = 'block';
      }
      setSize(w: number, h: number) {
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
      }
      setPixelRatio(ratio: number) { this._pixelRatio = ratio; }
      setClearColor(color: number | string | actual.Color) {
        if (typeof color === 'number') this._clearColor.setHex(color);
      }
      getClearColor(target: actual.Color) { target.copy(this._clearColor); return target; }
      render() {}
      dispose() {}
      getSize(target: actual.Vector2) {
        target.set(this.domElement.width / this._pixelRatio, this.domElement.height / this._pixelRatio);
        return target;
      }
    },
  };
});

describe('US-002: Full-screen canvas shell', () => {
  describe('initScene module', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    });

    it('returns renderer with a canvas domElement', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const result = initScene(container);
      expect(result.renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
      expect(result.scene).toBeDefined();
      expect(result.camera).toBeDefined();
    });

    it('canvas fills the viewport dimensions', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer } = initScene(container);
      expect(renderer.domElement.width).toBe(1024);
      expect(renderer.domElement.height).toBe(768);
    });

    it('canvas is appended to the provided container', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      initScene(container);
      const canvas = container.querySelector('canvas');
      expect(canvas).not.toBeNull();
    });

    it('canvas has display block to prevent inline gaps', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer } = initScene(container);
      expect(renderer.domElement.style.display).toBe('block');
    });
  });

  describe('resize handling', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    });

    it('updates canvas size on window resize', async () => {
      const { initScene } = await import('../src/visual/scene');
      const { attachResizeHandler } = await import('../src/visual/resize');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { renderer, camera } = initScene(container);
      attachResizeHandler(renderer, camera);

      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      expect(renderer.domElement.width).toBe(800);
      expect(renderer.domElement.height).toBe(600);
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
    });

    it('initScene sets a black background on the scene', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { scene } = initScene(container);
      const bg = scene.background as THREE.Color;
      expect(bg).toBeDefined();
      expect(bg.getHex()).toBe(0x000000);
    });
  });

  describe('render loop', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        cb(0);
        return 0;
      });
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
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });

    it('renders a canvas inside #app on import', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas');
      expect(canvas).not.toBeNull();
      expect(canvas?.tagName.toLowerCase()).toBe('canvas');
    });

    it('canvas dimensions match viewport (scaled by quality profile)', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
      // Quality scaling may reduce canvas buffer size below viewport
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

      // Quality scaling may reduce canvas buffer size below viewport
      expect(canvas.width).toBeLessThanOrEqual(800);
      expect(canvas.height).toBeLessThanOrEqual(600);
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);
    });
  });
});

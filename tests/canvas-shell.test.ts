import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-002: Full-screen canvas shell', () => {
  describe('initScene module', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
    });

    it('returns canvas and 2d rendering context', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const result = initScene(container);
      expect(result.canvas).toBeInstanceOf(HTMLCanvasElement);
      expect(result.ctx).toBeDefined();
    });

    it('canvas fills the viewport dimensions', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { canvas } = initScene(container);
      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(768);
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
      const { canvas } = initScene(container);
      expect(canvas.style.display).toBe('block');
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
      const { canvas, ctx } = initScene(container);
      attachResizeHandler(canvas, ctx);

      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });

    it('returns a cleanup function that removes the listener', async () => {
      const { initScene } = await import('../src/visual/scene');
      const { attachResizeHandler } = await import('../src/visual/resize');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { canvas, ctx } = initScene(container);
      const cleanup = attachResizeHandler(canvas, ctx);

      cleanup();

      Object.defineProperty(window, 'innerWidth', { value: 640, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 480, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(768);
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

    it('initScene fills canvas with dark background', async () => {
      const { initScene } = await import('../src/visual/scene');
      const container = document.querySelector<HTMLDivElement>('#app')!;
      const { ctx } = initScene(container);
      expect(ctx.fillStyle).toBe('#000000');
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
      const { canvas, ctx } = initScene(container);
      startLoop(canvas, ctx);
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

    it('canvas dimensions match viewport', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
      expect(canvas.width).toBe(1024);
      expect(canvas.height).toBe(768);
    });

    it('canvas updates on window resize', async () => {
      await import('../src/main');
      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;

      Object.defineProperty(window, 'innerWidth', { value: 800, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 600, writable: true, configurable: true });
      window.dispatchEvent(new Event('resize'));

      expect(canvas.width).toBe(800);
      expect(canvas.height).toBe(600);
    });
  });
});

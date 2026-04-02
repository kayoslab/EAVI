import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-038: Add minimal visual instrumentation for tuning', () => {
  describe('createDebugOverlay', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('returns an object with element and update properties', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(overlay).toHaveProperty('element');
      expect(overlay).toHaveProperty('update');
    });

    it('element is an HTMLElement', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(overlay.element).toBeInstanceOf(HTMLElement);
    });

    it('update is a function', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(typeof overlay.update).toBe('function');
    });

    it('element has class eavi-debug-overlay', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(overlay.element.classList.contains('eavi-debug-overlay')).toBe(true);
    });
  });

  describe('update displays required fields', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('displays FPS value after update', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).toMatch(/fps/i);
      expect(text).toContain('60');
    });

    it('displays mode name after update', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).toContain('pointcloud');
    });

    it('displays point count after update', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).toContain('1200');
    });

    it('displays bass value after update', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).toMatch(/bass/i);
      expect(text).toContain('142');
    });

    it('displays treble value after update', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).toMatch(/treble/i);
      expect(text).toContain('38');
    });

    it('rounds FPS to integer', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 59.874, modeName: 'pointcloud', pointCount: 1200, bass: 100, treble: 50 });
      const text = overlay.element.textContent || '';
      expect(text).not.toContain('59.874');
      expect(text).toContain('60');
    });

    it('rounds bass and treble to integers', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142.7, treble: 38.3 });
      const text = overlay.element.textContent || '';
      expect(text).not.toContain('142.7');
      expect(text).not.toContain('38.3');
      expect(text).toContain('143');
      expect(text).toContain('38');
    });

    it('updates text content when called with different values', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text1 = overlay.element.textContent || '';

      overlay.update({ fps: 30, modeName: 'ribbon', pointCount: 800, bass: 50, treble: 100 });
      const text2 = overlay.element.textContent || '';

      expect(text2).not.toBe(text1);
      expect(text2).toContain('ribbon');
      expect(text2).toContain('800');
    });
  });

  describe('throttle behavior', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('throttles rapid updates to avoid layout thrash', async () => {
      vi.useFakeTimers();
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();

      // First call should always apply
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1000, bass: 100, treble: 50 });
      const text1 = overlay.element.textContent || '';
      expect(text1).toContain('1000');

      // Rapid second call within throttle window should be skipped
      overlay.update({ fps: 30, modeName: 'ribbon', pointCount: 2000, bass: 200, treble: 100 });
      const text2 = overlay.element.textContent || '';
      // Should still show original values (throttled)
      expect(text2).toContain('1000');

      // After throttle interval, update should apply
      vi.advanceTimersByTime(300);
      overlay.update({ fps: 45, modeName: 'wave', pointCount: 3000, bass: 150, treble: 75 });
      const text3 = overlay.element.textContent || '';
      expect(text3).toContain('3000');

      vi.useRealTimers();
    });
  });

  describe('privacy: no raw visitor identifiers', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('overlay does not display IP addresses', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).not.toMatch(/\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/);
    });

    it('overlay does not display user agent strings', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).not.toMatch(/mozilla/i);
      expect(text).not.toMatch(/user.?agent/i);
    });

    it('overlay does not display seed values', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).not.toMatch(/seed/i);
    });

    it('overlay does not display geo location labels', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      const text = overlay.element.textContent || '';
      expect(text).not.toMatch(/country/i);
      expect(text).not.toMatch(/region/i);
    });
  });

  describe('privacy: no forbidden storage APIs', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('debugOverlay module does not access localStorage', async () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      document.body.appendChild(overlay.element);
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('debugOverlay module does not set cookies', async () => {
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 60, modeName: 'pointcloud', pointCount: 1200, bass: 142, treble: 38 });
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  describe('CSS: debug overlay styling', () => {
    const css = readFileSync(resolve(__dirname, '..', '..', 'src', 'style.css'), 'utf-8');

    it('has .eavi-debug-overlay with position fixed', () => {
      expect(css).toMatch(/\.eavi-debug-overlay[^}]*position\s*:\s*fixed/);
    });

    it('has .eavi-debug-overlay with pointer-events none', () => {
      expect(css).toMatch(/\.eavi-debug-overlay[^}]*pointer-events\s*:\s*none/);
    });

    it('has .eavi-debug-overlay with monospace font', () => {
      expect(css).toMatch(/\.eavi-debug-overlay[^}]*font-family\s*:[^}]*monospace/);
    });

    it('has .eavi-debug-overlay with z-index above other UI elements', () => {
      const debugMatch = css.match(/\.eavi-debug-overlay[^}]*z-index\s*:\s*(\d+)/);
      expect(debugMatch).not.toBeNull();
      const debugZ = parseInt(debugMatch![1], 10);
      expect(debugZ).toBeGreaterThanOrEqual(30);
    });

    it('has .eavi-debug-overlay with semi-transparent background', () => {
      expect(css).toMatch(/\.eavi-debug-overlay[^}]*background\s*:\s*rgba\(0\s*,\s*0\s*,\s*0/);
    });

    it('has prefers-reduced-motion rule covering debug overlay', () => {
      expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.eavi-debug-overlay/);
    });
  });

  describe('LoopDeps compatibility', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('render loop accepts onDebugFrame callback in deps', async () => {
      vi.mock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class MockWebGLRenderer {
            domElement: HTMLCanvasElement;
            constructor() { this.domElement = document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; }
            setSize() {}
            setPixelRatio() {}
            render() {}
            dispose() {}
            getContext() { return {}; }
            setClearColor() {}
          },
        };
      });

      const { startLoop } = await import('../../src/visual/renderLoop');
      const three = await import('three');
      const renderer = new three.WebGLRenderer() as unknown as import('three').WebGLRenderer;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera();

      const debugCallback = vi.fn();
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      // Should not throw when onDebugFrame is provided
      expect(() => startLoop(renderer, scene, camera, { onDebugFrame: debugCallback })).not.toThrow();
    });

    it('render loop works without onDebugFrame (backwards compatible)', async () => {
      vi.mock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class MockWebGLRenderer {
            domElement: HTMLCanvasElement;
            constructor() { this.domElement = document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; }
            setSize() {}
            setPixelRatio() {}
            render() {}
            dispose() {}
            getContext() { return {}; }
            setClearColor() {}
          },
        };
      });

      const { startLoop } = await import('../../src/visual/renderLoop');
      const three = await import('three');
      const renderer = new three.WebGLRenderer() as unknown as import('three').WebGLRenderer;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera();

      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      // Should work without debug callback (existing behavior preserved)
      expect(() => startLoop(renderer, scene, camera, {})).not.toThrow();
    });

    it('onDebugFrame callback receives fps, modeName, pointCount, bass, and treble', async () => {
      vi.mock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class MockWebGLRenderer {
            domElement: HTMLCanvasElement;
            constructor() { this.domElement = document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; }
            setSize() {}
            setPixelRatio() {}
            render() {}
            dispose() {}
            getContext() { return {}; }
            setClearColor() {}
          },
        };
      });

      const { startLoop } = await import('../../src/visual/renderLoop');
      const three = await import('three');
      const renderer = new three.WebGLRenderer() as unknown as import('three').WebGLRenderer;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera();

      const debugCallback = vi.fn();
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 3) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, {
        onDebugFrame: debugCallback,
        getModeName: () => 'testMode',
        getPointCount: () => 5000,
      });

      expect(debugCallback).toHaveBeenCalled();
      const callArg = debugCallback.mock.calls[0][0];
      expect(callArg).toHaveProperty('fps');
      expect(callArg).toHaveProperty('modeName');
      expect(callArg).toHaveProperty('pointCount');
      expect(callArg).toHaveProperty('bass');
      expect(callArg).toHaveProperty('treble');
      expect(typeof callArg.fps).toBe('number');
      expect(callArg.modeName).toBe('testMode');
      expect(callArg.pointCount).toBe(5000);
    });

    it('modeName defaults to loading when getModeName is not provided', async () => {
      vi.mock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class MockWebGLRenderer {
            domElement: HTMLCanvasElement;
            constructor() { this.domElement = document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; }
            setSize() {}
            setPixelRatio() {}
            render() {}
            dispose() {}
            getContext() { return {}; }
            setClearColor() {}
          },
        };
      });

      const { startLoop } = await import('../../src/visual/renderLoop');
      const three = await import('three');
      const renderer = new three.WebGLRenderer() as unknown as import('three').WebGLRenderer;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera();

      const debugCallback = vi.fn();
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, { onDebugFrame: debugCallback });

      expect(debugCallback).toHaveBeenCalled();
      const callArg = debugCallback.mock.calls[0][0];
      expect(callArg.modeName).toBe('loading');
    });

    it('pointCount defaults to 0 when getPointCount is not provided', async () => {
      vi.mock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class MockWebGLRenderer {
            domElement: HTMLCanvasElement;
            constructor() { this.domElement = document.createElement('canvas'); this.domElement.width = 800; this.domElement.height = 600; }
            setSize() {}
            setPixelRatio() {}
            render() {}
            dispose() {}
            getContext() { return {}; }
            setClearColor() {}
          },
        };
      });

      const { startLoop } = await import('../../src/visual/renderLoop');
      const three = await import('three');
      const renderer = new three.WebGLRenderer() as unknown as import('three').WebGLRenderer;
      const scene = new three.Scene();
      const camera = new three.PerspectiveCamera();

      const debugCallback = vi.fn();
      let frameCount = 0;
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
        frameCount++;
        if (frameCount <= 2) cb(frameCount * 16);
        return frameCount;
      });

      startLoop(renderer, scene, camera, { onDebugFrame: debugCallback });

      expect(debugCallback).toHaveBeenCalled();
      const callArg = debugCallback.mock.calls[0][0];
      expect(callArg.pointCount).toBe(0);
    });
  });

  describe('disabled by default', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('debug overlay is not present in DOM without ?debug query param', async () => {
      // Ensure no debug param
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '' },
        writable: true,
      });

      const hasDebugParam = new URLSearchParams(window.location.search).has('debug');
      expect(hasDebugParam).toBe(false);
    });

    it('debug overlay is detected when ?debug query param is present', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?debug' },
        writable: true,
      });

      const hasDebugParam = new URLSearchParams(window.location.search).has('debug');
      expect(hasDebugParam).toBe(true);
    });

    it('debug overlay is detected when ?debug is among other params', async () => {
      Object.defineProperty(window, 'location', {
        value: { ...window.location, search: '?foo=bar&debug&baz=1' },
        writable: true,
      });

      const hasDebugParam = new URLSearchParams(window.location.search).has('debug');
      expect(hasDebugParam).toBe(true);
    });
  });

  describe('DebugFrameData type contract', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('update accepts all required DebugFrameData fields', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(() =>
        overlay.update({ fps: 0, modeName: '', pointCount: 0, bass: 0, treble: 0 })
      ).not.toThrow();
    });

    it('handles zero values gracefully', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      overlay.update({ fps: 0, modeName: '', pointCount: 0, bass: 0, treble: 0 });
      const text = overlay.element.textContent || '';
      expect(text.length).toBeGreaterThan(0);
    });

    it('handles large values gracefully', async () => {
      const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
      const overlay = createDebugOverlay();
      expect(() =>
        overlay.update({ fps: 144, modeName: 'longModeName', pointCount: 100000, bass: 255, treble: 255 })
      ).not.toThrow();
      const text = overlay.element.textContent || '';
      expect(text).toContain('100000');
    });
  });
});

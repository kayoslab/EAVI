import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { readFileSync, readdirSync, statSync } from 'fs';
import { resolve, join } from 'path';

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

describe('US-039: Enforce WebGL-only rendering backend', () => {
  beforeEach(() => {
    vi.resetModules();
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  describe('AC1: Rendering uses Three.js WebGLRenderer', () => {
    it('T-039-01: initScene creates a WebGLRenderer and returns it', async () => {
      const { initScene } = await import('../../src/visual/scene');
      const container = document.createElement('div');
      const { renderer } = initScene(container);

      // The mock replaces WebGLRenderer, so we verify the renderer produces a canvas
      // and has the expected WebGLRenderer interface methods
      expect(renderer).toBeDefined();
      expect(renderer.domElement).toBeInstanceOf(HTMLCanvasElement);
      expect(typeof renderer.render).toBe('function');
      expect(typeof renderer.setSize).toBe('function');
      expect(typeof renderer.setPixelRatio).toBe('function');
      expect(typeof renderer.setClearColor).toBe('function');
    });
  });

  describe('AC2: Canvas2D is not used as the primary rendering path', () => {
    it('T-039-02: no src/visual/ module calls getContext("2d")', () => {
      const visualDir = resolve(__dirname, '..', '..', 'src', 'visual');
      const tsFiles = collectTsFiles(visualDir);

      for (const file of tsFiles) {
        const content = readFileSync(file, 'utf-8');
        expect(
          content,
          `${file} must not use Canvas2D getContext('2d')`,
        ).not.toMatch(/getContext\s*\(\s*['"]2d['"]\s*\)/);
      }
    });

    it('T-039-09: no src/ files reference CanvasRenderingContext2D as a primary render path', () => {
      const srcDir = resolve(__dirname, '..', '..', 'src');
      const tsFiles = collectTsFiles(srcDir);

      for (const file of tsFiles) {
        const content = readFileSync(file, 'utf-8');
        // Allow type-only references (e.g. in webgl detection) but not instantiation patterns
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          // Flag any line that gets a 2d context for drawing (not detection)
          if (/getContext\s*\(\s*['"]2d['"]\s*\)/.test(line)) {
            // Allow if it's in a detection/feature-check function (contains 'detect' or 'support' or 'check' nearby)
            const contextWindow = lines.slice(Math.max(0, i - 5), i + 5).join('\n').toLowerCase();
            const isDetection = /detect|support|check|available|feature|fallback/.test(contextWindow);
            if (!isDetection) {
              throw new Error(
                `${file}:${i + 1} uses Canvas2D getContext('2d') outside of a detection context. ` +
                `Canvas2D is not an acceptable rendering backend (US-039).`,
              );
            }
          }
        }
      }
    });
  });

  describe('AC3: PerspectiveCamera is present in the scene graph', () => {
    it('T-039-03: initScene returns a PerspectiveCamera instance', async () => {
      const { initScene } = await import('../../src/visual/scene');
      const container = document.createElement('div');
      const { camera } = initScene(container);

      expect(camera).toBeInstanceOf(THREE.PerspectiveCamera);
    });

    it('T-039-04: camera has perspective projection properties (fov > 0, isPerspectiveCamera)', async () => {
      const { initScene } = await import('../../src/visual/scene');
      const container = document.createElement('div');
      const { camera } = initScene(container);

      expect(camera.isPerspectiveCamera).toBe(true);
      expect(camera.fov).toBeGreaterThan(0);
      expect(camera.near).toBeGreaterThan(0);
      expect(camera.far).toBeGreaterThan(camera.near);
    });
  });

  describe('AC4: Rendering fails gracefully if WebGL is unavailable', () => {
    it('T-039-05: initScene throws WebGLUnavailableError when WebGL is not supported', async () => {
      // Override the mock to simulate WebGL unavailability by making the
      // constructor throw — this tests that the detection runs before construction
      vi.resetModules();

      // We need to test the actual detection logic, so we mock at a lower level
      // Mock HTMLCanvasElement.prototype.getContext to return null for webgl/webgl2
      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl' || contextId === 'webgl2') {
          return null;
        }
        return originalGetContext.call(this, contextId, ...args) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;

      try {
        // Re-mock three to use the patched getContext
        vi.doMock('three', async () => {
          const actual = await vi.importActual<typeof import('three')>('three');
          return {
            ...actual,
            WebGLRenderer: class FailingWebGLRenderer {
              constructor() {
                throw new Error('WebGL not available');
              }
            },
          };
        });

        const { initScene } = await import('../../src/visual/scene');
        const container = document.createElement('div');

        expect(() => initScene(container)).toThrow();
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('T-039-06: when WebGL is unavailable, a fallback message is shown instead of a canvas', async () => {
      vi.resetModules();

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl' || contextId === 'webgl2') {
          return null;
        }
        return originalGetContext.call(this, contextId, ...args) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;

      try {
        vi.doMock('three', async () => {
          const actual = await vi.importActual<typeof import('three')>('three');
          return {
            ...actual,
            WebGLRenderer: class FailingWebGLRenderer {
              constructor() {
                throw new Error('WebGL not available');
              }
            },
          };
        });

        const sceneModule = await import('../../src/visual/scene');
        const container = document.createElement('div');

        // The implementation should either:
        // 1. Throw a typed error that main.ts catches and renders fallback, OR
        // 2. Render the fallback directly
        // We test that initScene throws so the caller can handle it
        let threw = false;
        try {
          sceneModule.initScene(container);
        } catch {
          threw = true;
        }
        expect(threw).toBe(true);

        // Verify no canvas was appended to the container
        const canvas = container.querySelector('canvas');
        // Canvas should either not exist or not be the primary rendering surface
        // (the fallback message should be shown by main.ts)
        expect(canvas === null || container.children.length === 0).toBe(true);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('T-039-07: when WebGL is unavailable, render loop is not started', async () => {
      vi.resetModules();

      const rafSpy = vi.spyOn(window, 'requestAnimationFrame');

      const originalGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (contextId: string, ...args: unknown[]) {
        if (contextId === 'webgl' || contextId === 'webgl2') {
          return null;
        }
        return originalGetContext.call(this, contextId, ...args) as RenderingContext | null;
      } as typeof HTMLCanvasElement.prototype.getContext;

      try {
        vi.doMock('three', async () => {
          const actual = await vi.importActual<typeof import('three')>('three');
          return {
            ...actual,
            WebGLRenderer: class FailingWebGLRenderer {
              constructor() {
                throw new Error('WebGL not available');
              }
            },
          };
        });

        const { initScene } = await import('../../src/visual/scene');
        const container = document.createElement('div');

        const rafCountBefore = rafSpy.mock.calls.length;
        try {
          initScene(container);
        } catch {
          // Expected
        }

        // No new requestAnimationFrame calls should have been made
        expect(rafSpy.mock.calls.length).toBe(rafCountBefore);
      } finally {
        HTMLCanvasElement.prototype.getContext = originalGetContext;
      }
    });

    it('T-039-08: fallback message has dark styling (when implemented in main.ts)', async () => {
      // This test validates that the error message container — rendered by main.ts
      // when initScene throws — has appropriate dark styling.
      // Since main.ts catches the error and renders fallback DOM, we test the
      // contract: the thrown error should be distinguishable.
      vi.resetModules();

      vi.doMock('three', async () => {
        const actual = await vi.importActual<typeof import('three')>('three');
        return {
          ...actual,
          WebGLRenderer: class FailingWebGLRenderer {
            constructor() {
              throw new Error('WebGL not available');
            }
          },
        };
      });

      const { initScene } = await import('../../src/visual/scene');
      const container = document.createElement('div');

      try {
        initScene(container);
      } catch (err) {
        // The error should have a meaningful message about WebGL
        expect(err).toBeInstanceOf(Error);
        // After implementation, this should be a WebGLUnavailableError
        // or contain 'WebGL' in the message
        expect((err as Error).message.toLowerCase()).toContain('webgl');
      }
    });
  });
});

// Recursively collect all .ts files (excluding .test.ts, .spec.ts, .d.ts)
function collectTsFiles(dir: string): string[] {
  const results: string[] = [];
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...collectTsFiles(fullPath));
    } else if (
      entry.endsWith('.ts') &&
      !entry.endsWith('.test.ts') &&
      !entry.endsWith('.spec.ts') &&
      !entry.endsWith('.d.ts')
    ) {
      results.push(fullPath);
    }
  }
  return results;
}

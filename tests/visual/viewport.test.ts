import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';

// Mock Three.js WebGLRenderer for jsdom
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _pixelRatio = 1;

      constructor() {
        this.domElement = document.createElement('canvas');
      }

      setSize(w: number, h: number) {
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
        this.domElement.style.width = w + 'px';
        this.domElement.style.height = h + 'px';
      }

      setPixelRatio(ratio: number) {
        this._pixelRatio = ratio;
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

describe('US-028: Canvas CSS size independence from resolutionScale', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-028-01: canvas CSS dimensions fill viewport when resolutionScale is 0.5', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });

    // CSS width/height must equal full viewport, not scaled down
    const cssWidth = renderer.domElement.style.width;
    const cssHeight = renderer.domElement.style.height;
    // Canvas CSS should be 100% or match viewport px — must NOT be reduced by resolutionScale
    expect(
      cssWidth === '100%' || cssWidth === '375px'
    ).toBe(true);
    expect(
      cssHeight === '100%' || cssHeight === '667px'
    ).toBe(true);
  });

  it('T-028-01b: canvas CSS dimensions fill viewport when resolutionScale is 0.75', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.75 });

    const cssWidth = renderer.domElement.style.width;
    const cssHeight = renderer.domElement.style.height;
    expect(
      cssWidth === '100%' || cssWidth === '375px'
    ).toBe(true);
    expect(
      cssHeight === '100%' || cssHeight === '667px'
    ).toBe(true);
  });

  it('T-028-01c: canvas CSS dimensions fill viewport when resolutionScale is 1.0', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 1.0 });

    const cssWidth = renderer.domElement.style.width;
    const cssHeight = renderer.domElement.style.height;
    expect(
      cssWidth === '100%' || cssWidth === '375px'
    ).toBe(true);
    expect(
      cssHeight === '100%' || cssHeight === '667px'
    ).toBe(true);
  });
});

describe('US-028: Backing store scales with pixel ratio', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
  });

  it('T-028-02: backing store uses effective pixel ratio (DPR capped at 2 * resolutionScale)', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });

    // effectivePixelRatio = min(3, 2) * 0.5 = 1.0
    // backing store: 375 * 1.0 = 375, 667 * 1.0 = 667
    expect(renderer.domElement.width).toBe(375);
    expect(renderer.domElement.height).toBe(667);
  });

  it('T-028-02b: backing store at full resolution with scale 1.0 and DPR 2', async () => {
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 1.0 });

    // effectivePixelRatio = min(2, 2) * 1.0 = 2.0
    // backing store: 375 * 2 = 750, 667 * 2 = 1334
    expect(renderer.domElement.width).toBe(750);
    expect(renderer.domElement.height).toBe(1334);
  });
});

describe('US-028: Orientation change handling', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-028-03: orientationchange event triggers resize handler and updates dimensions', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(375, 667);
    const camera = new THREE.PerspectiveCamera(60, 375 / 667, 0.1, 100);

    attachResizeHandler(renderer, camera);

    // Simulate orientation change (portrait -> landscape)
    Object.defineProperty(window, 'innerWidth', { value: 667, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 375, configurable: true });
    window.dispatchEvent(new Event('orientationchange'));

    expect(camera.aspect).toBeCloseTo(667 / 375, 5);
    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(667);
    expect(size.y).toBe(375);
  });
});

describe('US-028: visualViewport integration', () => {
  let mockVisualViewport: {
    width: number;
    height: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockVisualViewport = {
      width: 375,
      height: 667,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', {
      value: mockVisualViewport,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('T-028-04: attaches resize listener to visualViewport when available', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(375, 667);
    const camera = new THREE.PerspectiveCamera(60, 375 / 667, 0.1, 100);

    attachResizeHandler(renderer, camera);

    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
  });

  it('T-028-04b: uses visualViewport dimensions when available for sizing', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(375, 667);
    const camera = new THREE.PerspectiveCamera(60, 375 / 667, 0.1, 100);

    attachResizeHandler(renderer, camera);

    // Simulate iOS Safari address bar hiding — visualViewport grows, window stays
    mockVisualViewport.width = 375;
    mockVisualViewport.height = 720;
    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });

    // Fire visualViewport resize
    const resizeCallback = mockVisualViewport.addEventListener.mock.calls.find(
      (call: unknown[]) => call[0] === 'resize'
    )?.[1] as (() => void) | undefined;
    if (resizeCallback) resizeCallback();

    // Should use visualViewport dimensions (375x720), not window (375x667)
    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(375);
    expect(size.y).toBe(720);
  });
});

describe('US-028: Listener cleanup', () => {
  let mockVisualViewport: {
    width: number;
    height: number;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockVisualViewport = {
      width: 1024,
      height: 768,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    Object.defineProperty(window, 'visualViewport', {
      value: mockVisualViewport,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
      writable: true,
    });
  });

  it('T-028-05: cleanup removes window resize listener', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1024, 768);
    const camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 100);

    const cleanup = attachResizeHandler(renderer, camera);
    cleanup();

    // Resize after cleanup should have no effect
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(1024);
    expect(size.y).toBe(768);
  });

  it('T-028-05b: cleanup removes orientationchange listener', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1024, 768);
    const camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 100);
    const spy = vi.spyOn(window, 'removeEventListener');

    const cleanup = attachResizeHandler(renderer, camera);
    cleanup();

    const removedEvents = spy.mock.calls.map((call) => call[0]);
    expect(removedEvents).toContain('orientationchange');
    spy.mockRestore();
  });

  it('T-028-05c: cleanup removes visualViewport resize listener', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1024, 768);
    const camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 100);

    const cleanup = attachResizeHandler(renderer, camera);
    cleanup();

    expect(mockVisualViewport.removeEventListener).toHaveBeenCalledWith(
      'resize',
      expect.any(Function),
    );
  });
});

describe('US-028: CSS size preservation on resize', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-028-06: after resize with resolutionScale 0.5, canvas CSS size is still full viewport', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1024, 768);
    const camera = new THREE.PerspectiveCamera(60, 1024 / 768, 0.1, 100);

    attachResizeHandler(renderer, camera, 0.5);

    Object.defineProperty(window, 'innerWidth', { value: 375, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 667, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const cssWidth = renderer.domElement.style.width;
    const cssHeight = renderer.domElement.style.height;
    // CSS must be 100% or match viewport pixels — not scaled down
    expect(
      cssWidth === '100%' || cssWidth === '375px'
    ).toBe(true);
    expect(
      cssHeight === '100%' || cssHeight === '667px'
    ).toBe(true);
  });
});

describe('US-028: visualViewport dimension preference', () => {
  it('T-028-07: resize falls back to window.innerWidth when visualViewport unavailable', async () => {
    Object.defineProperty(window, 'visualViewport', {
      value: undefined,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 1, configurable: true });

    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    attachResizeHandler(renderer, camera);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(1024);
    expect(size.y).toBe(768);
  });
});

describe('US-028: Scene init canvas style overrides', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 414, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 896, configurable: true });
    Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  });

  it('T-028-08: initScene sets canvas style.width and style.height to 100%', async () => {
    const { initScene } = await import('../../src/visual/scene');
    const container = document.createElement('div');
    const { renderer } = initScene(container, { resolutionScale: 0.5 });

    expect(renderer.domElement.style.width).toBe('100%');
    expect(renderer.domElement.style.height).toBe('100%');
  });
});

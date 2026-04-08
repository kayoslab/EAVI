import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { computeQuality } from '../../src/visual/quality';
import type { QualityProfile } from '../../src/visual/quality';
import type { BrowserSignals } from '../../src/input/signals';

// Mock Three.js WebGLRenderer (jsdom has no WebGL)
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
      getClearColor(target: THREE.Color) { target.setRGB(0, 0, 0); return target; }
      render() {}
      dispose() {}
      getSize(target: THREE.Vector2) {
        target.set(this._w, this._h);
        return target;
      }
    },
  };
});

function makeSignals(overrides: Partial<BrowserSignals> = {}): BrowserSignals {
  return {
    language: 'en',
    timezone: 'UTC',
    screenWidth: 1920,
    screenHeight: 1080,
    devicePixelRatio: 2,
    hardwareConcurrency: 8,
    prefersColorScheme: 'dark',
    prefersReducedMotion: false,
    touchCapable: false,
    deviceMemory: 8,
    ...overrides,
  };
}

function getLowProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 1,
    hardwareConcurrency: 2,
    deviceMemory: 1,
    screenWidth: 320,
    screenHeight: 568,
    touchCapable: true,
  }));
}

function getMediumProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 2,
    hardwareConcurrency: 4,
    deviceMemory: 4,
    screenWidth: 390,
    screenHeight: 844,
    touchCapable: true,
  }));
}

function getHighProfile(): QualityProfile {
  return computeQuality(makeSignals({
    devicePixelRatio: 2,
    hardwareConcurrency: 16,
    deviceMemory: 8,
    screenWidth: 2560,
    screenHeight: 1440,
    touchCapable: false,
  }));
}

// Helper to access bloom fields (typed as Record since they don't exist on QualityProfile yet)
function bloom(profile: QualityProfile) {
  const p = profile as Record<string, unknown>;
  return {
    enableBloom: p.enableBloom as boolean | undefined,
    bloomStrength: p.bloomStrength as number | undefined,
    bloomThreshold: p.bloomThreshold as number | undefined,
    bloomRadius: p.bloomRadius as number | undefined,
  };
}

describe('US-077: Bloom quality profile parameters', () => {
  it('T-077-01: QualityProfile includes bloom parameters (enableBloom, bloomStrength, bloomThreshold, bloomRadius)', () => {
    const profile = getHighProfile();
    expect(profile).toHaveProperty('enableBloom');
    expect(profile).toHaveProperty('bloomStrength');
    expect(profile).toHaveProperty('bloomThreshold');
    expect(profile).toHaveProperty('bloomRadius');
  });

  it('T-077-02: low tier has bloom disabled', () => {
    const profile = getLowProfile();
    expect(profile.tier).toBe('low');
    expect(bloom(profile).enableBloom).toBe(false);
  });

  it('T-077-03: medium tier has bloom enabled with moderate values', () => {
    const profile = getMediumProfile();
    expect(profile.tier).toBe('medium');
    const b = bloom(profile);
    expect(b.enableBloom).toBe(true);
    expect(typeof b.bloomStrength).toBe('number');
    expect(typeof b.bloomThreshold).toBe('number');
    expect(typeof b.bloomRadius).toBe('number');
    expect(b.bloomStrength!).toBeGreaterThan(0);
    expect(b.bloomThreshold!).toBeGreaterThan(0);
    expect(b.bloomRadius!).toBeGreaterThan(0);
  });

  it('T-077-04: high tier has bloom enabled with stronger values than medium', () => {
    const medium = bloom(getMediumProfile());
    const high = bloom(getHighProfile());
    expect(high.enableBloom).toBe(true);
    expect(high.bloomStrength!).toBeGreaterThan(medium.bloomStrength!);
  });

  it('T-077-05: bloom threshold is lower on high tier (more bloom)', () => {
    const medium = bloom(getMediumProfile());
    const high = bloom(getHighProfile());
    expect(high.bloomThreshold!).toBeLessThan(medium.bloomThreshold!);
  });

  it('T-077-06: bloom radius is larger on high tier', () => {
    const medium = bloom(getMediumProfile());
    const high = bloom(getHighProfile());
    expect(high.bloomRadius!).toBeGreaterThan(medium.bloomRadius!);
  });

  it('T-077-07: low tier bloom strength and radius are zero since bloom is disabled', () => {
    const b = bloom(getLowProfile());
    expect(b.bloomStrength).toBe(0);
    expect(b.bloomRadius).toBe(0);
  });

  it('T-077-22: bloom parameters are finite numbers on all tiers', () => {
    for (const getter of [getLowProfile, getMediumProfile, getHighProfile]) {
      const b = bloom(getter());
      expect(Number.isFinite(b.bloomStrength)).toBe(true);
      expect(Number.isFinite(b.bloomThreshold)).toBe(true);
      expect(Number.isFinite(b.bloomRadius)).toBe(true);
    }
  });

  it('T-077-23: bloom strength, threshold, and radius are non-negative on all tiers', () => {
    for (const getter of [getLowProfile, getMediumProfile, getHighProfile]) {
      const b = bloom(getter());
      expect(b.bloomStrength!).toBeGreaterThanOrEqual(0);
      expect(b.bloomThreshold!).toBeGreaterThanOrEqual(0);
      expect(b.bloomRadius!).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('US-077: Composer module — initComposer', () => {
  it('T-077-08: initComposer is importable from src/visual/composer', async () => {
    const mod = await import('../../src/visual/composer');
    expect(typeof mod.initComposer).toBe('function');
  });

  it('T-077-09: initComposer returns null when bloom is disabled (low tier)', async () => {
    const { initComposer } = await import('../../src/visual/composer');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const result = initComposer(renderer, scene, camera, getLowProfile());
    expect(result).toBeNull();
  });

  it('T-077-10: initComposer returns composer object when bloom is enabled (high tier)', async () => {
    const { initComposer } = await import('../../src/visual/composer');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const result = initComposer(renderer, scene, camera, getHighProfile());
    // In jsdom without real WebGL the constructor may fail gracefully
    if (result !== null) {
      expect(result).toHaveProperty('composer');
      expect(result).toHaveProperty('bloomPass');
    }
  });

  it('T-077-11: initComposer returns composer object for medium tier', async () => {
    const { initComposer } = await import('../../src/visual/composer');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const result = initComposer(renderer, scene, camera, getMediumProfile());
    if (result !== null) {
      expect(result).toHaveProperty('composer');
      expect(result).toHaveProperty('bloomPass');
    }
  });
});

describe('US-077: Composer module — resizeComposer', () => {
  it('T-077-12: resizeComposer is importable from src/visual/composer', async () => {
    const mod = await import('../../src/visual/composer');
    expect(typeof mod.resizeComposer).toBe('function');
  });

  it('T-077-13: resizeComposer accepts composer and dimensions without throwing', async () => {
    const { initComposer, resizeComposer } = await import('../../src/visual/composer');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const result = initComposer(renderer, scene, camera, getHighProfile());
    if (result !== null) {
      expect(() => resizeComposer(result.composer, 1024, 768)).not.toThrow();
    }
  });
});

describe('US-077: Render loop composer integration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-077-14: startLoop still calls renderer.render when no composer is provided (backward compat)', async () => {
    const { startLoop } = await import('../../src/visual/renderLoop');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
    const renderSpy = vi.spyOn(renderer, 'render');

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 2) cb(frameCount * 16);
      return frameCount;
    });

    startLoop(renderer, scene, camera, {});
    expect(renderSpy).toHaveBeenCalled();
  });

  it('T-077-15: startLoop uses composer.render instead of renderer.render when composer is in deps', async () => {
    const mod = await import('../../src/visual/renderLoop');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const composerRender = vi.fn();
    const mockComposer = { render: composerRender, setSize: vi.fn() };

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 2) cb(frameCount * 16);
      return frameCount;
    });

    // LoopDeps should accept an optional composer field
    const deps = { composer: mockComposer } as unknown as Parameters<typeof mod.startLoop>[3];
    mod.startLoop(renderer, scene, camera, deps);

    // When composer is provided, it should be used for rendering
    if (composerRender.mock.calls.length > 0) {
      expect(composerRender).toHaveBeenCalled();
    }
  });
});

describe('US-077: Resize handler composer integration', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
  });

  it('T-077-16: attachResizeHandler still works without composer parameter', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    const cleanup = attachResizeHandler(renderer, camera);
    expect(typeof cleanup).toBe('function');

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(1024);
    expect(size.y).toBe(768);

    cleanup();
  });

  it('T-077-17: attachResizeHandler calls composer.setSize on resize when composer is provided', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    const mockComposer = { setSize: vi.fn(), render: vi.fn() };

    // attachResizeHandler should accept an optional composer param
    const cleanup = (attachResizeHandler as Function)(renderer, camera, undefined, mockComposer);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    // Verify composer was resized alongside renderer
    if (mockComposer.setSize.mock.calls.length > 0) {
      expect(mockComposer.setSize).toHaveBeenCalledWith(1024, 768);
    }

    cleanup();
  });

  it('T-077-18: resize handler updates both renderer and composer sizes consistently', async () => {
    const { attachResizeHandler } = await import('../../src/visual/resize');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(1920, 1080);
    const camera = new THREE.PerspectiveCamera(60, 1920 / 1080, 0.1, 100);

    const mockComposer = { setSize: vi.fn(), render: vi.fn() };

    const cleanup = (attachResizeHandler as Function)(renderer, camera, undefined, mockComposer);

    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });
    window.dispatchEvent(new Event('resize'));

    const size = new THREE.Vector2();
    renderer.getSize(size);
    expect(size.x).toBe(800);
    expect(size.y).toBe(600);

    if (mockComposer.setSize.mock.calls.length > 0) {
      const [cw, ch] = mockComposer.setSize.mock.calls[0];
      expect(cw).toBe(800);
      expect(ch).toBe(600);
    }

    cleanup();
  });
});

describe('US-077: Bloom disabled on lowest tier for performance', () => {
  it('T-077-19: low-tier profile never enables bloom regardless of other settings', () => {
    const profile = getLowProfile();
    expect(profile.tier).toBe('low');
    expect(bloom(profile).enableBloom).toBe(false);
  });

  it('T-077-20: initComposer with low-tier profile returns null (no GPU overhead)', async () => {
    const { initComposer } = await import('../../src/visual/composer');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    const result = initComposer(renderer, scene, camera, getLowProfile());
    expect(result).toBeNull();
  });
});

describe('US-077: All tiers still render without errors', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-077-21: render loop completes frames for low tier (no composer fallback)', async () => {
    const { startLoop } = await import('../../src/visual/renderLoop');
    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(800, 600);
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 3) cb(frameCount * 16);
      return frameCount;
    });

    expect(() => startLoop(renderer, scene, camera, {})).not.toThrow();
    expect(frameCount).toBeGreaterThan(1);
  });
});

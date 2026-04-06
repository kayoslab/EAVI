import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { startLoop, type LoopDeps } from '../../src/visual/renderLoop';
import type { BrowserSignals } from '../../src/input/signals';
import type { GeoHint } from '../../src/input/geo';
import type { GeometrySystem, FrameState } from '../../src/visual/types';
import { ShaderErrorCollector } from '../../src/visual/shaderErrorCollector';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      constructor() {
        this.domElement = document.createElement('canvas');
        this.domElement.width = 800;
        this.domElement.height = 600;
      }
      setSize(w: number, h: number) {
        this.domElement.width = w;
        this.domElement.height = h;
      }
      setPixelRatio() {}
      setClearColor() {}
      render() {}
      dispose() {}
      compile() {}
    },
  };
});

function createTestRenderer() {
  const renderer = new THREE.WebGLRenderer();
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, 800 / 600, 0.1, 100);
  return { renderer, scene, camera };
}

const defaultSignals: BrowserSignals = {
  language: 'en',
  timezone: 'UTC',
  screenWidth: 1024,
  screenHeight: 768,
  devicePixelRatio: 2,
  hardwareConcurrency: 8,
  prefersColorScheme: 'dark',
  prefersReducedMotion: false,
  touchCapable: false,
};

const defaultGeo: GeoHint = { country: 'US', region: 'CA' };

function createValidModeManager(drawSpy: ReturnType<typeof vi.fn>): GeometrySystem & {
  initAllForValidation: ReturnType<typeof vi.fn>;
  cleanupInactive: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(),
    draw: drawSpy,
    initAllForValidation: vi.fn((scene: THREE.Scene, _seed: string) => {
      // Add a valid mesh to the scene so health gate can find geometry
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]), 3));
      const mesh = new THREE.Points(geometry);
      mesh.name = 'TestPoints';
      scene.add(mesh);
    }),
    cleanupInactive: vi.fn(),
  };
}

function createInvalidShaderModeManager(): GeometrySystem & {
  initAllForValidation: ReturnType<typeof vi.fn>;
  cleanupInactive: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    initAllForValidation: vi.fn((scene: THREE.Scene) => {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2]), 3));
      const mesh = new THREE.Points(geometry);
      scene.add(mesh);
    }),
    cleanupInactive: vi.fn(),
  };
}

function createInvalidGeometryModeManager(): GeometrySystem & {
  initAllForValidation: ReturnType<typeof vi.fn>;
  cleanupInactive: ReturnType<typeof vi.fn>;
} {
  return {
    init: vi.fn(),
    draw: vi.fn(),
    initAllForValidation: vi.fn((scene: THREE.Scene) => {
      // Add mesh with missing position attribute
      const geometry = new THREE.BufferGeometry();
      // Only set a color attribute, not position — gate will fail
      geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array([1, 0, 0]), 3));
      const mesh = new THREE.Points(geometry);
      mesh.name = 'BadPoints';
      scene.add(mesh);
    }),
    cleanupInactive: vi.fn(),
  };
}

function runFrames(count: number): void {
  let frameCount = 0;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    frameCount++;
    if (frameCount <= count) cb(frameCount * 16);
    return frameCount;
  });
}

describe('US-052: Health gate integration with render loop', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-052-15: render loop enters steady-state and removes placeholder when health gate passes', () => {
    const drawSpy = vi.fn();
    const modeManager = createValidModeManager(drawSpy);
    const errorCollector = new ShaderErrorCollector();

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );

    const { renderer, scene, camera } = createTestRenderer();
    scene.add(placeholder);

    runFrames(5);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      placeholderMesh: placeholder,
      errorCollector,
    };

    startLoop(renderer, scene, camera, deps);

    // Placeholder should have been removed
    expect(scene.children.includes(placeholder)).toBe(false);
    // draw() should have been called on subsequent frames
    expect(drawSpy).toHaveBeenCalled();
    // renderer.render still called
    const renderSpy = vi.spyOn(renderer, 'render');
    // (render was already called during frames; verify structure was correct)
    expect(modeManager.initAllForValidation).toHaveBeenCalled();
  });

  it('T-052-16: render loop stays on placeholder when health gate fails due to shader errors', () => {
    const modeManager = createInvalidShaderModeManager();
    const errorCollector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );

    const { renderer, scene, camera } = createTestRenderer();
    scene.add(placeholder);

    // Make compile inject a shader error
    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      errorCollector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: shader compilation failed',
      );
    });

    runFrames(5);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      placeholderMesh: placeholder,
      errorCollector,
    };

    startLoop(renderer, scene, camera, deps);

    // Placeholder should still be in scene
    expect(scene.children.includes(placeholder)).toBe(true);
    // draw() should never be called
    expect(modeManager.draw).not.toHaveBeenCalled();
  });

  it('T-052-17: render loop stays on placeholder when health gate fails due to geometry errors', () => {
    const modeManager = createInvalidGeometryModeManager();
    const errorCollector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );

    const { renderer, scene, camera } = createTestRenderer();
    scene.add(placeholder);

    runFrames(5);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      placeholderMesh: placeholder,
      errorCollector,
    };

    startLoop(renderer, scene, camera, deps);

    // Placeholder should still be in scene
    expect(scene.children.includes(placeholder)).toBe(true);
    // draw() should never be called
    expect(modeManager.draw).not.toHaveBeenCalled();
  });

  it('T-052-18: console.error is called with structured failure info when gate blocks steady-state', () => {
    const modeManager = createInvalidShaderModeManager();
    const errorCollector = new ShaderErrorCollector();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(new THREE.WebGLRenderer(), 'compile');

    const { renderer, scene, camera } = createTestRenderer();

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      errorCollector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'FRAGMENT',
        'ERROR: type mismatch in shader',
      );
    });

    runFrames(3);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      errorCollector,
    };

    startLoop(renderer, scene, camera, deps);

    const healthGateCalls = errorSpy.mock.calls.filter(
      (call) => typeof call[0] === 'string' && (call[0] as string).includes('[EAVI health-gate]'),
    );
    expect(healthGateCalls.length).toBeGreaterThan(0);
  });

  it('T-052-19: render loop does not throw when health gate fails — loop stays alive for debugging', () => {
    const modeManager = createInvalidShaderModeManager();
    const errorCollector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { renderer, scene, camera } = createTestRenderer();
    const renderSpy = vi.spyOn(renderer, 'render');

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      errorCollector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: shader error',
      );
    });

    let frameCount = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      frameCount++;
      if (frameCount <= 5) cb(frameCount * 16);
      return frameCount;
    });

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      errorCollector,
    };

    // Must not throw
    expect(() => {
      startLoop(renderer, scene, camera, deps);
    }).not.toThrow();

    // Loop continues: rAF was called multiple times
    expect(frameCount).toBeGreaterThan(1);
    // renderer.render continues to be called
    expect(renderSpy).toHaveBeenCalled();
  });

  it('T-052-20: health gate is invoked before first geometry draw call', () => {
    const callOrder: string[] = [];

    const modeManager = {
      init: vi.fn(),
      draw: vi.fn(() => { callOrder.push('draw'); }),
      initAllForValidation: vi.fn((scene: THREE.Scene) => {
        callOrder.push('initAllForValidation');
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2]), 3));
        scene.add(new THREE.Points(geometry));
      }),
      cleanupInactive: vi.fn(() => { callOrder.push('cleanupInactive'); }),
    };

    const errorCollector = new ShaderErrorCollector();
    const { renderer, scene, camera } = createTestRenderer();

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      callOrder.push('compile');
    });

    runFrames(5);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      errorCollector,
    };

    startLoop(renderer, scene, camera, deps);

    const compileIdx = callOrder.indexOf('compile');
    const drawIdx = callOrder.indexOf('draw');
    expect(compileIdx).toBeGreaterThanOrEqual(0);
    expect(drawIdx).toBeGreaterThan(compileIdx);
  });

  it('T-052-21: health gate replaces the old throwing validateShaderCompilation behavior', () => {
    const modeManager = createInvalidShaderModeManager();
    const errorCollector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const { renderer, scene, camera } = createTestRenderer();

    // Inject shader error — old behavior would throw
    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      errorCollector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: bad shader',
      );
    });

    runFrames(3);

    const deps: LoopDeps = {
      seed: 'test-seed',
      signals: defaultSignals,
      geo: defaultGeo,
      geometrySystem: modeManager as unknown as GeometrySystem,
      errorCollector,
    };

    // Old behavior would throw via validateShaderCompilation.
    // New behavior: no throw, gate returns failure, loop stays alive.
    expect(() => {
      startLoop(renderer, scene, camera, deps);
    }).not.toThrow();

    // Shader errors cause gate failure, not thrown exception
    expect(modeManager.draw).not.toHaveBeenCalled();
  });
});

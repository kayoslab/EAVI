import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as THREE from 'three';
import { runStartupHealthGate } from '../../src/visual/healthGate';
import { ShaderErrorCollector } from '../../src/visual/shaderErrorCollector';
import type { GeometrySystemInfo, HealthGateResult } from '../../src/visual/types';

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
      setSize() {}
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

function makeValidGeometry(name: string): GeometrySystemInfo {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const colors = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  const sizes = new Float32Array([1, 1, 1]);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  return {
    name,
    geometry,
    requiredAttrs: [
      { name: 'position', itemSize: 3 },
      { name: 'color', itemSize: 3 },
      { name: 'size', itemSize: 1 },
    ],
  };
}

describe('US-052: Health gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('T-052-01: gate passes when shaders compile cleanly and all geometry attributes are valid', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    const systems = [makeValidGeometry('PointCloud'), makeValidGeometry('ParticleField')];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(true);
    expect(result.shaderErrors).toHaveLength(0);
    expect(result.geometryErrors).toHaveLength(0);
  });

  it('T-052-02: gate fails and returns structured shader errors when compilation produces errors', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    // Seed the collector with an error before the gate runs
    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      collector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: 0:5: undeclared identifier "foo"',
      );
    });

    const result = runStartupHealthGate(renderer, scene, camera, collector, []);

    expect(result.passed).toBe(false);
    expect(result.shaderErrors.length).toBeGreaterThan(0);
    expect(result.shaderErrors[0].shaderType).toBe('VERTEX');
    expect(result.shaderErrors[0].message).toContain('undeclared identifier');
  });

  it('T-052-03: gate fails and returns structured geometry errors when attributes are missing', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    const geometry = new THREE.BufferGeometry();
    // No position attribute set
    const systems: GeometrySystemInfo[] = [
      {
        name: 'BrokenSystem',
        geometry,
        requiredAttrs: [{ name: 'position', itemSize: 3 }],
      },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(false);
    expect(result.geometryErrors.length).toBeGreaterThan(0);
    expect(result.geometryErrors[0].attribute).toBe('position');
    expect(result.geometryErrors[0].reason).toContain('missing');
  });

  it('T-052-04: gate fails when geometry attribute has wrong itemSize', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2, 3]), 2));
    const systems: GeometrySystemInfo[] = [
      {
        name: 'WrongSize',
        geometry,
        requiredAttrs: [{ name: 'position', itemSize: 3 }],
      },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(false);
    expect(result.geometryErrors.some((e) => e.attribute === 'position' && e.reason.includes('itemSize'))).toBe(true);
  });

  it('T-052-05: gate fails when geometry attribute contains NaN values', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, NaN, 2]), 3));
    const systems: GeometrySystemInfo[] = [
      {
        name: 'NaNSystem',
        geometry,
        requiredAttrs: [{ name: 'position', itemSize: 3 }],
      },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(false);
    expect(result.geometryErrors.some((e) => e.reason.includes('NaN'))).toBe(true);
  });

  it('T-052-06: gate fails and aggregates both shader and geometry errors when both are present', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      collector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'FRAGMENT',
        'ERROR: undeclared variable',
      );
    });

    const geometry = new THREE.BufferGeometry();
    // Missing color attribute
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 1, 2]), 3));
    const systems: GeometrySystemInfo[] = [
      {
        name: 'Broken',
        geometry,
        requiredAttrs: [
          { name: 'position', itemSize: 3 },
          { name: 'color', itemSize: 3 },
        ],
      },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(false);
    expect(result.shaderErrors.length).toBeGreaterThan(0);
    expect(result.geometryErrors.length).toBeGreaterThan(0);
  });

  it('T-052-07: gate logs structured failure with [EAVI health-gate] prefix on shader error', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      collector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: shader compile failed',
      );
    });

    runStartupHealthGate(renderer, scene, camera, collector, []);

    expect(errorSpy).toHaveBeenCalled();
    const msg = errorSpy.mock.calls[0][0] as string;
    expect(msg).toContain('[EAVI health-gate]');
    expect(msg).toContain('Shader');
  });

  it('T-052-08: gate logs structured failure with [EAVI health-gate] prefix on geometry error', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const geometry = new THREE.BufferGeometry();
    const systems: GeometrySystemInfo[] = [
      {
        name: 'BadGeo',
        geometry,
        requiredAttrs: [{ name: 'position', itemSize: 3 }],
      },
    ];

    runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(errorSpy).toHaveBeenCalled();
    const firstArg = errorSpy.mock.calls[0][0] as string;
    const secondArg = errorSpy.mock.calls[0][1] as string;
    expect(firstArg).toContain('[EAVI health-gate]');
    expect(firstArg + ' ' + secondArg).toContain('position');
  });

  it('T-052-09: gate does not log to console.error when all checks pass', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const systems = [makeValidGeometry('Valid')];
    runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('T-052-10: gate calls renderer.compile(scene, camera) to force synchronous shader compilation', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    const compileSpy = vi.spyOn(renderer, 'compile');

    runStartupHealthGate(renderer, scene, camera, collector, []);

    expect(compileSpy).toHaveBeenCalledOnce();
    expect(compileSpy).toHaveBeenCalledWith(scene, camera);
  });

  it('T-052-11: gate validates all geometry systems from ModeManager, not just the active one', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    const validSystem = makeValidGeometry('PointCloud');
    const invalidGeometry = new THREE.BufferGeometry();
    // No position attribute — invalid
    const invalidSystem: GeometrySystemInfo = {
      name: 'RibbonField',
      geometry: invalidGeometry,
      requiredAttrs: [{ name: 'position', itemSize: 3 }],
    };

    const result = runStartupHealthGate(renderer, scene, camera, collector, [validSystem, invalidSystem]);

    expect(result.passed).toBe(false);
    expect(result.geometryErrors.some((e) => e.systemName === 'RibbonField')).toBe(true);
  });

  it('T-052-12: gate includes systemName in geometry errors when available', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();

    const geometry = new THREE.BufferGeometry();
    const systems: GeometrySystemInfo[] = [
      {
        name: 'ParticleField',
        geometry,
        requiredAttrs: [{ name: 'position', itemSize: 3 }],
      },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    expect(result.passed).toBe(false);
    expect(result.geometryErrors[0].systemName).toBe('ParticleField');
  });

  it('T-052-13: gate does not throw — returns result object on failure', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      collector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'VERTEX',
        'ERROR: bad shader',
      );
    });

    const geometry = new THREE.BufferGeometry();
    const systems: GeometrySystemInfo[] = [
      { name: 'Bad', geometry, requiredAttrs: [{ name: 'position', itemSize: 3 }] },
    ];

    let result: HealthGateResult | undefined;
    expect(() => {
      result = runStartupHealthGate(renderer, scene, camera, collector, systems);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(result!.passed).toBe(false);
  });

  it('T-052-14: HealthGateResult type has correct shape', () => {
    const { renderer, scene, camera } = createTestRenderer();
    const collector = new ShaderErrorCollector();
    vi.spyOn(console, 'error').mockImplementation(() => {});

    vi.spyOn(renderer, 'compile').mockImplementation(() => {
      collector.collect(
        {} as WebGLRenderingContext,
        {} as WebGLShader,
        'FRAGMENT',
        'ERROR: type mismatch',
      );
    });

    const geometry = new THREE.BufferGeometry();
    const systems: GeometrySystemInfo[] = [
      { name: 'TestSys', geometry, requiredAttrs: [{ name: 'position', itemSize: 3 }] },
    ];

    const result = runStartupHealthGate(renderer, scene, camera, collector, systems);

    // passed is boolean
    expect(typeof result.passed).toBe('boolean');
    // shaderErrors is array
    expect(Array.isArray(result.shaderErrors)).toBe(true);
    // geometryErrors is array
    expect(Array.isArray(result.geometryErrors)).toBe(true);
    // shaderErrors entries have shaderType and message
    expect(result.shaderErrors[0]).toHaveProperty('shaderType');
    expect(result.shaderErrors[0]).toHaveProperty('message');
    // geometryErrors entries have attribute and reason
    expect(result.geometryErrors[0]).toHaveProperty('attribute');
    expect(result.geometryErrors[0]).toHaveProperty('reason');
  });
});

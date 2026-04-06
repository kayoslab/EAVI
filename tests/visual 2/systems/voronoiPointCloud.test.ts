import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createPointCloud } from '../../../src/visual/systems/pointCloud';
import { computeQuality } from '../../../src/visual/quality';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';

const defaultParams: VisualParams = {
  paletteHue: 180,
  paletteSaturation: 0.5,
  cadence: 0.7,
  density: 0.6,
  motionAmplitude: 1.0,
  pointerDisturbance: 0,
  bassEnergy: 0,
  trebleEnergy: 0,
  curveSoftness: 0.5,
  structureComplexity: 0.5,
  noiseFrequency: 1.0,
  radialScale: 1.0,
  twistStrength: 1.0,
  fieldSpread: 1.0,
};

function makeFrame(overrides?: Partial<FrameState & { params: Partial<VisualParams> }>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams, ...(overrides?.params ?? {}) },
    ...Object.fromEntries(Object.entries(overrides ?? {}).filter(([k]) => k !== 'params')),
  } as FrameState;
}

describe('US-058: Voronoi cellular fragment shader — point cloud wiring', () => {
  it('T-058-10: createPointCloud({ useVoronoiShader: true }) initialises without error', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(points).toBeDefined();
  });

  it('T-058-11: voronoi-enabled ShaderMaterial has uVoronoiGridSize uniform', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uVoronoiGridSize).toBeDefined();
    expect(typeof mat.uniforms.uVoronoiGridSize.value).toBe('number');
  });

  it('T-058-12: draw() updates uVoronoiGridSize reflecting structureComplexity', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-grid-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    cloud.draw(scene, makeFrame({ params: { structureComplexity: 0.0 } }));
    const lowComplexity = mat.uniforms.uVoronoiGridSize.value;

    cloud.draw(scene, makeFrame({ params: { structureComplexity: 1.0 } }));
    const highComplexity = mat.uniforms.uVoronoiGridSize.value;

    expect(lowComplexity).toBeGreaterThanOrEqual(3.0);
    expect(highComplexity).toBeLessThanOrEqual(6.0);
    expect(highComplexity).toBeGreaterThan(lowComplexity);
  });

  it('T-058-13: draw() with high trebleEnergy does not throw', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-treble-seed', defaultParams);
    expect(() => {
      cloud.draw(scene, makeFrame({ params: { trebleEnergy: 0.9 } }));
    }).not.toThrow();
  });

  it('T-058-14: createPointCloud({ useVoronoiShader: false }) does NOT have uVoronoiGridSize', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: false });
    cloud.init(scene, 'no-voronoi-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uVoronoiGridSize).toBeUndefined();
  });

  it('T-058-15: setOpacity works on voronoi-configured point cloud', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-opacity-seed', defaultParams);
    cloud.setOpacity!(0.4);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uOpacity.value).toBe(0.4);
  });
});

describe('US-058: Voronoi fragment shader content validation', () => {
  it('T-058-20: voronoi fragmentShader contains uVoronoiGridSize, gl_PointCoord, and F2', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-content-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/uVoronoiGridSize/);
    expect(mat.fragmentShader).toMatch(/gl_PointCoord/);
    expect(mat.fragmentShader).toMatch(/F2/);
  });

  it('T-058-21: voronoi fragment shader does NOT contain noise3d patterns (snoise/fbm3)', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-nonoise-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).not.toMatch(/snoise/);
    expect(mat.fragmentShader).not.toMatch(/fbm3/);
  });

  it('T-058-24: voronoi fragment shader contains fog uniforms and vDepth for depth fog', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-fog-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/uFogNear/);
    expect(mat.fragmentShader).toMatch(/uFogFar/);
    expect(mat.fragmentShader).toMatch(/vDepth/);
  });

  it('T-058-25: voronoi fragment shader contains audio energy uniforms', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-audio-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/uBassEnergy/);
    expect(mat.fragmentShader).toMatch(/uTrebleEnergy/);
  });

  it('T-058-26: voronoi fragment shader uses vColor varying for palette coloring', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-vcolor-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/vColor/);
  });
});

describe('US-058: Voronoi point cloud lifecycle', () => {
  it('T-058-27: voronoi-enabled point cloud cleanup disposes geometry and material', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-cleanup-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoSpy = vi.spyOn(points.geometry, 'dispose');
    const matSpy = vi.spyOn(points.material as THREE.Material, 'dispose');

    cloud.cleanup();

    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-058-28: all uniform values remain finite after draw with extreme params', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-finite-seed', defaultParams);
    cloud.draw(scene, makeFrame({
      elapsed: 100000,
      params: { bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 },
    }));
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    for (const [name, uniform] of Object.entries(mat.uniforms)) {
      if (typeof uniform.value === 'number') {
        expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
      }
    }
  });

  it('T-058-29: no localStorage or cookie access with voronoi shader enabled', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const cloud = createPointCloud({ useVoronoiShader: true });
    cloud.init(scene, 'voronoi-privacy-seed', defaultParams);
    cloud.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

describe('US-058: Quality profile voronoi settings', () => {
  it('T-058-22: low tier has enableVoronoiCells === false', () => {
    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 320, screenHeight: 568,
      devicePixelRatio: 1, hardwareConcurrency: 2, prefersColorScheme: 'dark' as const,
      prefersReducedMotion: false, touchCapable: true, deviceMemory: 1,
    };
    const result = computeQuality(signals);
    expect(result.tier).toBe('low');
    expect(result.enableVoronoiCells).toBe(false);
  });

  it('T-058-23: high tier has enableVoronoiCells === true', () => {
    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 2560, screenHeight: 1440,
      devicePixelRatio: 2, hardwareConcurrency: 16, prefersColorScheme: 'dark' as const,
      prefersReducedMotion: false, touchCapable: false, deviceMemory: 8,
    };
    const result = computeQuality(signals);
    expect(result.tier).toBe('high');
    expect(result.enableVoronoiCells).toBe(true);
  });
});

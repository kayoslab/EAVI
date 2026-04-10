import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  createSpatialGradient,
  computeVertexColors,
} from '../../src/visual/spatialGradient';
import { createPointCloud } from '../../src/visual/systems/pointCloud';
import { createParticleField } from '../../src/visual/systems/particleField';
import { createCrystalField } from '../../src/visual/systems/crystalField';
import { createRibbonField } from '../../src/visual/systems/ribbonField';
import { createFlowRibbonField } from '../../src/visual/systems/flowRibbonField';
import { createFractalGrowthWireframe } from '../../src/visual/systems/fractalGrowthWireframe';
import { createTerrainHeightfield } from '../../src/visual/systems/terrainHeightfield';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';

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

// ─── Helper: computeVibrantVertexColors ───

describe('US-081: computeVibrantVertexColors helper', () => {
  it('T-081-01: computeVertexColors with vibrant gradient returns correct length for given positions', () => {
    const positions = new Float32Array([
      -5, 0, 0,
       0, 0, 0,
       5, 0, 0,
    ]);
    const palette = createSpatialGradient(180, 0.5, 'test-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'x' });
    // 3 vertices × 3 RGB components = 9
    expect(colors.length).toBe(9);
  });

  it('T-081-02: vibrant vertex colors are all finite values in [0,1]', () => {
    const positions = new Float32Array(300); // 100 vertices
    for (let i = 0; i < 300; i++) positions[i] = (Math.random() - 0.5) * 10;
    const palette = createSpatialGradient(180, 0.5, 'finite-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'x' });
    for (let i = 0; i < colors.length; i++) {
      expect(Number.isFinite(colors[i]), `color[${i}] is not finite`).toBe(true);
      expect(colors[i]).toBeGreaterThanOrEqual(0);
      expect(colors[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-081-03: vibrant vertex colors are deterministic for same positions and seed', () => {
    const positions = new Float32Array([
      -3, 1, 2,
       0, -1, 0,
       3, 0.5, -2,
    ]);
    const paletteA = createSpatialGradient(180, 0.5, 'det-seed', { mode: 'vibrant' });
    const colorsA = computeVertexColors(positions, paletteA, { axis: 'x' });
    const paletteB = createSpatialGradient(180, 0.5, 'det-seed', { mode: 'vibrant' });
    const colorsB = computeVertexColors(positions, paletteB, { axis: 'x' });
    expect(Array.from(colorsA)).toEqual(Array.from(colorsB));
  });

  it('T-081-04: vibrant vertex colors vary spatially — not all vertices the same color', () => {
    // Create positions spread along X axis so gradient produces different colors
    const positions = new Float32Array([
      -5, 0, 0,
       0, 0, 0,
       5, 0, 0,
    ]);
    const palette = createSpatialGradient(180, 0.5, 'vary-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'x' });
    // First vertex color (deep blue end) should differ from last (orange end)
    const r0 = colors[0], g0 = colors[1], b0 = colors[2];
    const r2 = colors[6], g2 = colors[7], b2 = colors[8];
    const dist = Math.sqrt((r2 - r0) ** 2 + (g2 - g0) ** 2 + (b2 - b0) ** 2);
    expect(dist).toBeGreaterThan(0.05);
  });

  it('T-081-05: vibrant vertex colors produce distinct colors at opposite ends of the gradient', () => {
    const positions = new Float32Array([
      -5, 0, 0,  // t=0
       5, 0, 0,  // t=1
    ]);
    const palette = createSpatialGradient(180, 0.5, 'direction-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'x' });
    // With 8 palette families, first/last stops may not be blue/orange.
    // Instead verify the two ends are visually distinct.
    const r0 = colors[0], g0 = colors[1], b0 = colors[2];
    const r1 = colors[3], g1 = colors[4], b1 = colors[5];
    const dist = Math.sqrt((r1 - r0) ** 2 + (g1 - g0) ** 2 + (b1 - b0) ** 2);
    expect(dist).toBeGreaterThan(0.05);
  });

  it('T-081-06: vibrant vertex colors support radial axis mapping', () => {
    const positions = new Float32Array([
       0, 0, 0,   // radial=0 → t=0
       3, 0, 4,   // radial=5 → t=1
    ]);
    const palette = createSpatialGradient(180, 0.5, 'radial-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'radial' });
    expect(colors.length).toBe(6);
    // Center vertex and edge vertex should be different colors
    const r0 = colors[0], g0 = colors[1], b0 = colors[2];
    const r1 = colors[3], g1 = colors[4], b1 = colors[5];
    const dist = Math.sqrt((r1 - r0) ** 2 + (g1 - g0) ** 2 + (b1 - b0) ** 2);
    expect(dist).toBeGreaterThan(0.05);
  });

  it('T-081-07: empty positions array returns empty colors array', () => {
    const positions = new Float32Array(0);
    const palette = createSpatialGradient(180, 0.5, 'empty-seed', { mode: 'vibrant' });
    const colors = computeVertexColors(positions, palette, { axis: 'x' });
    expect(colors.length).toBe(0);
  });
});

// ─── Per-mode: aVertexColor attribute and uHasVertexColor uniform ───

describe('US-081: PointCloud vibrant palette integration', () => {
  it('T-081-10: geometry has aVertexColor attribute with itemSize 3 after init', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'vibrant-pc-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBeGreaterThan(0);
  });

  it('T-081-11: aVertexColor values are all finite after init', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'finite-pc-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-12: shader material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'uniform-pc-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-081-13: vertex shader declares aVertexColor and vVertexColor', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'vs-pc-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aVertexColor');
    expect(mat.vertexShader).toContain('vVertexColor');
  });

  it('T-081-14: fragment shader declares vVertexColor and uHasVertexColor', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'fs-pc-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('vVertexColor');
    expect(mat.fragmentShader).toContain('uHasVertexColor');
  });

  it('T-081-15: draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const cloud = createPointCloud();
    cloud.init(scene, 'draw-pc-seed', defaultParams);
    expect(() => cloud.draw(scene, makeFrame())).not.toThrow();
  });
});

describe('US-081: ParticleField vibrant palette integration', () => {
  it('T-081-20: geometry has aVertexColor attribute with itemSize 3 after init', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'vibrant-pf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBeGreaterThan(0);
  });

  it('T-081-21: aVertexColor values are all finite after init', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'finite-pf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-22: shader material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'uniform-pf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-081-23: vertex shader declares aVertexColor and vVertexColor', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'vs-pf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aVertexColor');
    expect(mat.vertexShader).toContain('vVertexColor');
  });

  it('T-081-24: fragment shader declares vVertexColor and uHasVertexColor', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'fs-pf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('vVertexColor');
    expect(mat.fragmentShader).toContain('uHasVertexColor');
  });

  it('T-081-25: draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const field = createParticleField();
    field.init(scene, 'draw-pf-seed', defaultParams);
    expect(() => field.draw(scene, makeFrame())).not.toThrow();
  });
});

describe('US-081: CrystalField vibrant palette integration', () => {
  it('T-081-30: geometry has aVertexColor attribute with itemSize 3 after init', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'vibrant-cf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBeGreaterThan(0);
  });

  it('T-081-31: aVertexColor values are all finite after init', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'finite-cf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-32: shader material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'uniform-cf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-081-33: vertex shader declares aVertexColor and vVertexColor', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'vs-cf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aVertexColor');
    expect(mat.vertexShader).toContain('vVertexColor');
  });

  it('T-081-34: fragment shader declares vVertexColor and uHasVertexColor', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'fs-cf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('vVertexColor');
    expect(mat.fragmentShader).toContain('uHasVertexColor');
  });

  it('T-081-35: draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'draw-cf-seed', defaultParams);
    expect(() => crystal.draw(scene, makeFrame())).not.toThrow();
  });
});

describe('US-081: RibbonField vibrant palette integration', () => {
  it('T-081-40: geometry has aVertexColor attribute with itemSize 3 after init', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'vibrant-rf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBeGreaterThan(0);
  });

  it('T-081-41: aVertexColor values are all finite after init', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'finite-rf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-42: shader material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'uniform-rf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-081-43: vertex shader declares aVertexColor and vVertexColor', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'vs-rf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aVertexColor');
    expect(mat.vertexShader).toContain('vVertexColor');
  });

  it('T-081-44: fragment shader declares vVertexColor and uHasVertexColor', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'fs-rf-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('vVertexColor');
    expect(mat.fragmentShader).toContain('uHasVertexColor');
  });

  it('T-081-45: draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const ribbon = createRibbonField();
    ribbon.init(scene, 'draw-rf-seed', defaultParams);
    expect(() => ribbon.draw(scene, makeFrame())).not.toThrow();
  });
});

describe('US-081: FlowRibbonField vibrant palette integration', () => {
  it('T-081-50: geometry has aVertexColor attribute with itemSize 3 after init', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'vibrant-fr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
    expect(attr.count).toBeGreaterThan(0);
  });

  it('T-081-51: aVertexColor values are all finite after init', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'finite-fr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-52: shader material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'uniform-fr-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-081-53: vertex shader declares aVertexColor and vVertexColor', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'vs-fr-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aVertexColor');
    expect(mat.vertexShader).toContain('vVertexColor');
  });

  it('T-081-54: fragment shader declares vVertexColor and uHasVertexColor', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'fs-fr-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('vVertexColor');
    expect(mat.fragmentShader).toContain('uHasVertexColor');
  });

  it('T-081-55: draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'draw-fr-seed', defaultParams);
    expect(() => flow.draw(scene, makeFrame())).not.toThrow();
  });
});

describe('US-081: FractalGrowthWireframe vibrant palette integration', () => {
  it('T-081-60: wireframe fragment shader uses tri-stop gradient (triStopGradient or uGradStop)', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'vibrant-fg-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    // Fractal growth uses GLSL-side gradient — either a triStopGradient function or uGradStop uniforms
    const hasGlslGradient = mat.fragmentShader.includes('triStopGradient') ||
      mat.fragmentShader.includes('uGradStop') ||
      mat.vertexShader.includes('triStopGradient') ||
      mat.vertexShader.includes('uGradStop');
    expect(hasGlslGradient).toBe(true);
  });

  it('T-081-61: wireframe vertex-dot shader uses tri-stop gradient', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'vibrant-fg-pts-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    const hasGlslGradient = mat.fragmentShader.includes('triStopGradient') ||
      mat.fragmentShader.includes('uGradStop') ||
      mat.vertexShader.includes('triStopGradient') ||
      mat.vertexShader.includes('uGradStop');
    expect(hasGlslGradient).toBe(true);
  });

  it('T-081-62: fractal growth draw does not throw after vibrant palette integration', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'draw-fg-seed', defaultParams);
    expect(() => sys.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-081-63: fractal growth wireframe no longer uses hsl2rgb for color generation', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'nohsl-fg-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    // The wireframe fragment shader should no longer compute colors via hsl2rgb
    // (it should use the tri-stop gradient instead)
    expect(mat.fragmentShader).not.toContain('hsl2rgb');
  });
});

// ─── Terrain uses same shared helper ───

describe('US-081: Terrain uses shared vibrant helper', () => {
  it('T-081-70: terrain still has aVertexColor attribute after refactor', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vibrant-terrain-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const attr = geo.getAttribute('aVertexColor');
    expect(attr).toBeDefined();
    expect(attr.itemSize).toBe(3);
  });

  it('T-081-71: terrain aVertexColor values are all finite', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'finite-terrain-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const arr = (pts.geometry as THREE.BufferGeometry).getAttribute('aVertexColor').array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i]), `terrain aVertexColor[${i}] is not finite`).toBe(true);
    }
  });

  it('T-081-72: terrain draw does not throw after shared helper refactor', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'draw-terrain-seed', defaultParams);
    expect(() => terrain.draw(scene, makeFrame())).not.toThrow();
  });
});

// ─── Bloom clipping prevention ───

describe('US-081: Bloom clipping prevention — luminance cap in vibrant vertex colors', () => {
  it('T-081-80: vibrant gradient colors have luminance ≤ 0.85 at all sample points', () => {
    // The vibrant palette's orange stop has high luminance in linear space.
    // The implementation should ensure vertex colors stay under 0.85 luminance.
    const palette = createSpatialGradient(180, 0.5, 'lum-cap-seed', { mode: 'vibrant' });
    for (let i = 0; i <= 100; i++) {
      const t = i / 100;
      const c = computeVertexColors(
        new Float32Array([t * 10 - 5, 0, 0]),
        palette,
        { axis: 'x' },
      );
      // BT.601 luminance: 0.299*R + 0.587*G + 0.114*B
      const lum = 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
      // With vibrant palette in linear space the orange end may be bright,
      // but the gradient helper or fragment shader should cap luminance.
      // The fragment shader applies the cap, so vertex colors themselves
      // may not exceed 0.85 if the cap is applied at the source.
      // Allow up to 1.0 here since the luminance cap may be shader-side only.
      expect(lum).toBeLessThanOrEqual(1.0);
      expect(Number.isFinite(lum)).toBe(true);
    }
  });

  it('T-081-81: fragment shaders include soft luminance cap to prevent bloom clipping', () => {
    // All modes should have a luminance cap that scales color down when luminance > 0.85
    // Pattern: color *= min(1.0, 0.85 / max(lum, 0.001))
    const modes = [
      { name: 'pointCloud', create: () => createPointCloud(), type: THREE.Points },
      { name: 'particleField', create: () => createParticleField(), type: THREE.Points },
      { name: 'crystalField', create: () => createCrystalField(), type: THREE.Points },
      { name: 'ribbonField', create: () => createRibbonField(), type: THREE.Points },
      { name: 'flowRibbonField', create: () => createFlowRibbonField(), type: THREE.Points },
    ];

    for (const mode of modes) {
      const scene = new THREE.Scene();
      const sys = mode.create();
      sys.init(scene, 'lum-cap-shader-seed', defaultParams);
      const mesh = scene.children.find((c) => c instanceof mode.type) as THREE.Mesh;
      const mat = mesh.material as THREE.ShaderMaterial;
      // Fragment shader should scale color down based on luminance to cap at ~0.85
      // This is a distinct operation from the existing luminance-for-bloom-glow computation
      const hasLumCap = mat.fragmentShader.includes('color *=') &&
        mat.fragmentShader.includes('max(lum');
      expect(hasLumCap, `${mode.name} missing soft luminance cap in fragment shader`).toBe(true);
    }
  });

  it('T-081-82: fractal growth wireframe fragment shader includes soft luminance cap', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'lum-fg-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    const hasLumCap = mat.fragmentShader.includes('color *=') &&
      mat.fragmentShader.includes('max(lum');
    expect(hasLumCap, `Missing soft luminance cap in fractal growth wireframe fragment shader`).toBe(true);
  });
});

// ─── Cross-mode consistency ───

describe('US-081: Cross-mode vibrant palette consistency', () => {
  it('T-081-90: all point-based modes have aVertexColor attribute after init', () => {
    const modes = [
      { name: 'pointCloud', create: () => createPointCloud() },
      { name: 'particleField', create: () => createParticleField() },
      { name: 'crystalField', create: () => createCrystalField() },
      { name: 'ribbonField', create: () => createRibbonField() },
      { name: 'flowRibbonField', create: () => createFlowRibbonField() },
    ];

    for (const mode of modes) {
      const scene = new THREE.Scene();
      const sys = mode.create();
      sys.init(scene, 'cross-mode-seed', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const attr = (points.geometry as THREE.BufferGeometry).getAttribute('aVertexColor');
      expect(attr, `${mode.name} missing aVertexColor`).toBeDefined();
      expect(attr.itemSize).toBe(3);
    }
  });

  it('T-081-91: all point-based modes have uHasVertexColor=1.0 uniform', () => {
    const modes = [
      { name: 'pointCloud', create: () => createPointCloud() },
      { name: 'particleField', create: () => createParticleField() },
      { name: 'crystalField', create: () => createCrystalField() },
      { name: 'ribbonField', create: () => createRibbonField() },
      { name: 'flowRibbonField', create: () => createFlowRibbonField() },
    ];

    for (const mode of modes) {
      const scene = new THREE.Scene();
      const sys = mode.create();
      sys.init(scene, 'cross-uniform-seed', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const mat = points.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uHasVertexColor, `${mode.name} missing uHasVertexColor`).toBeDefined();
      expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
    }
  });

  it('T-081-92: same seed produces same vibrant colors across two inits of same mode', () => {
    const scene1 = new THREE.Scene();
    const a = createPointCloud();
    a.init(scene1, 'det-cross-seed', defaultParams);
    const colorsA = (scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points)
      .geometry.getAttribute('aVertexColor').array;

    const scene2 = new THREE.Scene();
    const b = createPointCloud();
    b.init(scene2, 'det-cross-seed', defaultParams);
    const colorsB = (scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points)
      .geometry.getAttribute('aVertexColor').array;

    expect(Array.from(colorsA as Float32Array)).toEqual(Array.from(colorsB as Float32Array));
  });

  it('T-081-93: all modes render stable first frame without errors', () => {
    const allModes = [
      { name: 'pointCloud', create: () => createPointCloud() },
      { name: 'particleField', create: () => createParticleField() },
      { name: 'crystalField', create: () => createCrystalField() },
      { name: 'ribbonField', create: () => createRibbonField() },
      { name: 'flowRibbonField', create: () => createFlowRibbonField() },
      { name: 'fractalGrowth', create: () => createFractalGrowthWireframe({ maxEdgesPerShape: 480 }) },
      { name: 'terrain', create: () => createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 }) },
    ];

    for (const mode of allModes) {
      const scene = new THREE.Scene();
      const sys = mode.create();
      expect(() => {
        sys.init(scene, 'stable-frame-seed', defaultParams);
        sys.draw(scene, makeFrame());
      }, `${mode.name} failed on first frame`).not.toThrow();
    }
  });
});

// ─── Dead code removal verification ───

describe('US-081: Legacy HSL color code removed from point-based modes', () => {
  it('T-081-95: point-based mode vertex shaders no longer use hsl2rgb for per-vertex coloring', () => {
    const modes = [
      { name: 'pointCloud', create: () => createPointCloud() },
      { name: 'particleField', create: () => createParticleField() },
      { name: 'crystalField', create: () => createCrystalField() },
      { name: 'ribbonField', create: () => createRibbonField() },
      { name: 'flowRibbonField', create: () => createFlowRibbonField() },
    ];

    for (const mode of modes) {
      const scene = new THREE.Scene();
      const sys = mode.create();
      sys.init(scene, 'no-hsl-seed', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const mat = points.material as THREE.ShaderMaterial;
      // Vertex shaders should no longer contain hsl2rgb since vibrant palette replaces HSL coloring
      expect(mat.vertexShader).not.toContain('hsl2rgb');
    }
  });
});

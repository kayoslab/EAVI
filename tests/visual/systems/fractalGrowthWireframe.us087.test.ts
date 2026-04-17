import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFractalGrowthWireframe } from '../../../src/visual/systems/fractalGrowthWireframe';
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

function stdDev(arr: Float32Array, offset: number, stride: number, count: number): number {
  if (count === 0) return 0;
  let sum = 0;
  for (let i = 0; i < count; i++) sum += arr[i * stride + offset];
  const mean = sum / count;
  let variance = 0;
  for (let i = 0; i < count; i++) {
    const d = arr[i * stride + offset] - mean;
    variance += d * d;
  }
  return Math.sqrt(variance / count);
}

describe('US-087: fractalGrowthWireframe 3D recursive structure', () => {
  it('T-087-30: geometry is non-coplanar — 3D spread, not flat cubes', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 960 });
    sys.init(scene, 'fg-3d-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posAttr = (pts.geometry as THREE.BufferGeometry).getAttribute('position');
    const positions = (posAttr as THREE.BufferAttribute).array as Float32Array;
    const count = posAttr.count;

    const sx = stdDev(positions, 0, 3, count);
    const sy = stdDev(positions, 1, 3, count);
    const sz = stdDev(positions, 2, 3, count);

    // All three axes must have significant spread (not flat/screen-aligned)
    expect(Math.min(sx, sy, sz)).toBeGreaterThan(0.05);
  });

  it('T-087-31: positions span meaningful range on all 3 axes (visible depth/parallax)', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 960 });
    sys.init(scene, 'fg-depth-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posAttr = (pts.geometry as THREE.BufferGeometry).getAttribute('position');
    const positions = (posAttr as THREE.BufferAttribute).array as Float32Array;
    const count = posAttr.count;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    // Each axis must have a non-trivial range
    expect(maxX - minX).toBeGreaterThan(0.3);
    expect(maxY - minY).toBeGreaterThan(0.3);
    expect(maxZ - minZ).toBeGreaterThan(0.3);
  });

  it('T-087-32: edgePositions form tree-like connected segments', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 960 });
    sys.init(scene, 'fg-tree-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posAttr = (line.geometry as THREE.BufferGeometry).getAttribute('position');
    const positions = (posAttr as THREE.BufferAttribute).array as Float32Array;
    const edgeCount = posAttr.count / 2;

    // Each edge is a line pair: collect start/end points
    const starts: [number, number, number][] = [];
    const ends: [number, number, number][] = [];
    for (let i = 0; i < edgeCount; i++) {
      starts.push([positions[i * 6], positions[i * 6 + 1], positions[i * 6 + 2]]);
      ends.push([positions[i * 6 + 3], positions[i * 6 + 4], positions[i * 6 + 5]]);
    }

    // Non-degenerate edges: start and end should differ
    let nonDegenerateCount = 0;
    for (let i = 0; i < edgeCount; i++) {
      const dx = starts[i][0] - ends[i][0];
      const dy = starts[i][1] - ends[i][1];
      const dz = starts[i][2] - ends[i][2];
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) > 0.001) {
        nonDegenerateCount++;
      }
    }
    expect(nonDegenerateCount).toBe(edgeCount);
  });

  it('T-087-33: vertex shader contains bass growth pulse using aRandom.y (depthRatio)', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-bass-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const vs = (line.material as THREE.ShaderMaterial).vertexShader;
    // Shader must reference both bass energy and aRandom.y for growth pulse
    expect(vs).toMatch(/uBassEnergy/);
    expect(vs).toMatch(/aRandom/);
  });

  it('T-087-34: vertex dot shader contains treble-driven tip sparkle using aRandom.y', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-treble-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const vs = (pts.material as THREE.ShaderMaterial).vertexShader;
    // Shader must use treble energy for sparkle
    expect(vs).toMatch(/uTrebleEnergy/);
    expect(vs).toMatch(/aRandom/);
    // Should have a sparkle term involving treble
    expect(vs).toMatch(/sparkle|Sparkle|trebleSparkle/i);
  });

  it('T-087-35: fragment shaders contain tri-stop vibrant gradient', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-gradient-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const edgeFs = (line.material as THREE.ShaderMaterial).fragmentShader;
    const vertFs = (pts.material as THREE.ShaderMaterial).fragmentShader;
    // Both fragment shaders must include the tri-stop gradient function
    expect(edgeFs).toMatch(/triStopGradient/);
    expect(vertFs).toMatch(/triStopGradient/);
  });

  it('T-087-36: shaders declare all required uniforms', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-uniform-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const edgeVs = (line.material as THREE.ShaderMaterial).vertexShader;
    const vertVs = (pts.material as THREE.ShaderMaterial).vertexShader;

    const edgeFs = (line.material as THREE.ShaderMaterial).fragmentShader;
    const vertFs = (pts.material as THREE.ShaderMaterial).fragmentShader;

    // Vertex shader uniforms
    const vertexUniforms = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy',
      'uMotionAmplitude', 'uNoiseOctaves', 'uDisplacementScale',
    ];
    for (const name of vertexUniforms) {
      expect(edgeVs).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\b`));
      expect(vertVs).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\b`));
    }

    // Fragment shader uniforms
    const fragmentUniforms = ['uOpacity', 'uBassEnergy', 'uTrebleEnergy'];
    for (const name of fragmentUniforms) {
      expect(edgeFs).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\b`));
      expect(vertFs).toMatch(new RegExp(`uniform\\s+\\w+\\s+${name}\\b`));
    }
  });

  it('T-087-37: shaders declare aRandom attribute', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-attr-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const edgeVs = (line.material as THREE.ShaderMaterial).vertexShader;
    const vertVs = (pts.material as THREE.ShaderMaterial).vertexShader;
    expect(edgeVs).toMatch(/attribute\s+vec3\s+aRandom/);
    expect(vertVs).toMatch(/attribute\s+vec3\s+aRandom/);
  });

  it('T-087-38: fragment shaders use chromatic dispersion', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-disp-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const edgeFs = (line.material as THREE.ShaderMaterial).fragmentShader;
    const vertFs = (pts.material as THREE.ShaderMaterial).fragmentShader;
    expect(edgeFs).toMatch(/chromatic/i);
    expect(vertFs).toMatch(/chromatic/i);
  });

  it('T-087-39: bass drives macro deformation in edge vertex shader', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-macro-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const vs = (line.material as THREE.ShaderMaterial).vertexShader;
    // Bass expansion term
    expect(vs).toMatch(/uBassEnergy\s*\*/);
    // Bass noise displacement
    expect(vs).toMatch(/bassNoise|fbm3/);
  });

  it('T-087-40: all existing system interface tests still apply (LineSegments + Points + ShaderMaterial)', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-iface-seed', defaultParams);

    // LineSegments and Points exist
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(points.length).toBeGreaterThanOrEqual(1);

    // Both use ShaderMaterial
    const lineMat = (lines[0] as THREE.LineSegments).material as THREE.ShaderMaterial;
    const ptsMat = (points[0] as THREE.Points).material as THREE.ShaderMaterial;
    expect(lineMat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(ptsMat).toBeInstanceOf(THREE.ShaderMaterial);

    // Materials are transparent with AdditiveBlending
    expect(lineMat.transparent).toBe(true);
    expect(lineMat.blending).toBe(THREE.AdditiveBlending);
    expect(ptsMat.transparent).toBe(true);
    expect(ptsMat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-087-41: draw() and cleanup() still work correctly after geometry swap', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-lifecycle-seed', defaultParams);

    // draw should not throw
    expect(() => sys.draw(scene, makeFrame({ elapsed: 500, params: { bassEnergy: 0.8, trebleEnergy: 0.6 } }))).not.toThrow();

    // Uniforms updated
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    expect(u.uBassEnergy.value).toBe(0.8);
    expect(u.uTrebleEnergy.value).toBe(0.6);

    // Cleanup should remove everything
    sys.cleanup();
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
  });

  it('T-087-42: setOpacity still works on swapped geometry', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-opacity-seed', defaultParams);
    sys.setOpacity(0.3);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((line.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.3);
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.3);
  });
});

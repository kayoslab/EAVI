import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import type { VisualParams } from '../../src/visual/mappings';
import type { FrameState } from '../../src/visual/types';
import { createTerrainHeightfield } from '../../src/visual/systems/terrainHeightfield';

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

describe('US-075: Terrain system vertex color integration', () => {
  // --- Vertex color attribute presence ---
  // US-076 removed LineSegments; terrain is now Points-only

  it('T-075-25: Points geometry has aVertexColor attribute with itemSize 3 (was LineSegments before US-076)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-edge-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const geo = pts.geometry as THREE.BufferGeometry;
    const vcAttr = geo.getAttribute('aVertexColor');
    expect(vcAttr).toBeDefined();
    expect(vcAttr.itemSize).toBe(3);
    expect(vcAttr.count).toBeGreaterThan(0);
  });

  it('T-075-26: Points geometry has aVertexColor attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-pts-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const geo = pts.geometry as THREE.BufferGeometry;
    const vcAttr = geo.getAttribute('aVertexColor');
    expect(vcAttr).toBeDefined();
    expect(vcAttr.itemSize).toBe(3);
    expect(vcAttr.count).toBeGreaterThan(0);
  });

  it('T-075-27: aVertexColor count matches position count for Points', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-match-edge', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    const vcAttr = geo.getAttribute('aVertexColor');
    expect(vcAttr.count).toBe(posAttr.count);
  });

  it('T-075-28: aVertexColor count matches position count for Points', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-match-pts', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    const vcAttr = geo.getAttribute('aVertexColor');
    expect(vcAttr.count).toBe(posAttr.count);
  });

  // --- Vertex color values ---

  it('T-075-29: vertex color values are all in [0,1] range for Points', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-val-edge', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const vcAttr = geo.getAttribute('aVertexColor') as THREE.BufferAttribute;
    const arr = vcAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0);
      expect(arr[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-30: vertex color values are all in [0,1] range for Points', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-val-pts', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const vcAttr = geo.getAttribute('aVertexColor') as THREE.BufferAttribute;
    const arr = vcAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0);
      expect(arr[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-075-31: vertex colors are not all identical (visible gradient zones exist)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'vc-gradient-vis', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const vcAttr = geo.getAttribute('aVertexColor') as THREE.BufferAttribute;
    const arr = vcAttr.array as Float32Array;

    const firstR = arr[0];
    const firstG = arr[1];
    const firstB = arr[2];
    let hasDifference = false;
    for (let i = 3; i < arr.length; i += 3) {
      if (
        Math.abs(arr[i] - firstR) > 0.01 ||
        Math.abs(arr[i + 1] - firstG) > 0.01 ||
        Math.abs(arr[i + 2] - firstB) > 0.01
      ) {
        hasDifference = true;
        break;
      }
    }
    expect(hasDifference).toBe(true);
  });

  // --- uHasVertexColor uniform ---

  it('T-075-32: Points material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-uni-edge', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  it('T-075-33: Points material has uHasVertexColor uniform set to 1.0', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'vc-uni-pts', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uHasVertexColor).toBeDefined();
    expect(mat.uniforms.uHasVertexColor.value).toBe(1.0);
  });

  // --- No regression: existing attributes still present ---

  it('T-075-34: Points still has position and aRandom attributes after vertex color addition', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'no-regress-edge', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
  });

  it('T-075-35: Points still has position and aRandom attributes after vertex color addition', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'no-regress-pts', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
  });

  // --- Existing uniform paths still work ---

  it('T-075-36: existing palette uniforms (uPaletteHue, uPaletteSaturation) still present', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'palette-uni', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPaletteHue).toBeDefined();
    expect(mat.uniforms.uPaletteSaturation).toBeDefined();
  });

  // --- draw() still works ---

  it('T-075-37: draw() does not throw after init with vertex colors', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'draw-test', defaultParams);
    expect(() => terrain.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-075-38: draw() updates audio uniforms normally with vertex colors present', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'draw-audio', defaultParams);

    const frame = makeFrame({ params: { bassEnergy: 0.8, trebleEnergy: 0.6 } });
    terrain.draw(scene, frame);

    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.6);
  });

  // --- Cleanup ---

  it('T-075-39: cleanup() removes meshes from scene (no vertex color leak)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'cleanup-test', defaultParams);
    expect(scene.children.length).toBeGreaterThan(0);
    terrain.cleanup();
    expect(scene.children.length).toBe(0);
  });

  // --- Deterministic vertex colors ---

  it('T-075-40: same seed produces identical vertex colors', () => {
    const scene1 = new THREE.Scene();
    const terrain1 = createTerrainHeightfield({ rows: 6, cols: 6, pointCount: 5000 });
    terrain1.init(scene1, 'deterministic-vc', defaultParams);

    const scene2 = new THREE.Scene();
    const terrain2 = createTerrainHeightfield({ rows: 6, cols: 6, pointCount: 5000 });
    terrain2.init(scene2, 'deterministic-vc', defaultParams);

    const pts1 = scene1.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pts2 = scene2.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const vc1 = (pts1.geometry as THREE.BufferGeometry).getAttribute('aVertexColor') as THREE.BufferAttribute;
    const vc2 = (pts2.geometry as THREE.BufferGeometry).getAttribute('aVertexColor') as THREE.BufferAttribute;

    expect(Array.from(vc1.array as Float32Array)).toEqual(Array.from(vc2.array as Float32Array));
  });
});

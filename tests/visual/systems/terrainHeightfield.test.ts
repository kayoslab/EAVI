import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';

// The system under test — US-076 replaced wireframe with dense particle sheet
import { createTerrainHeightfield } from '../../../src/visual/systems/terrainHeightfield';

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

describe('US-074: Terrain heightfield render system with audio reactivity', () => {
  // ─── Initialization & Scene Structure ───
  // US-076 removed LineSegments; terrain is now Points-only

  it('T-074-01: init() does NOT add LineSegments (US-076 replaced wireframe with points)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'terrain-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBe(0);
  });

  it('T-074-02: init() adds THREE.Points (vertices) to the scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'terrain-seed', defaultParams);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(points.length).toBeGreaterThanOrEqual(1);
  });

  it('T-074-04: Points geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'pts-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const geo = pts.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(0);
  });

  it('T-074-06: Points geometry has aRandom attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'random-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = pts.geometry as THREE.BufferGeometry;
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });

  it('T-074-08: Points use ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'shader-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-074-09: material is transparent with AdditiveBlending and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'blend-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-074-13: terrain spans X and Z axes (grid extent > 0 in both)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'span-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos = pts.geometry.getAttribute('position');
    let minX = Infinity, maxX = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxX - minX).toBeGreaterThan(1);
    expect(maxZ - minZ).toBeGreaterThan(1);
  });

  it('T-074-14: terrain has height variation in Y axis (not flat plane)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'height-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos = pts.geometry.getAttribute('position');
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(maxY - minY).toBeGreaterThan(0.01);
  });

  it('T-074-15: all position values are finite', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'finite-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos = pts.geometry.getAttribute('position');
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i]), `position[${i}] is not finite`).toBe(true);
    }
  });

  // ─── Determinism ───

  it('T-074-16: same seed produces identical geometry (deterministic)', () => {
    const sceneA = new THREE.Scene();
    const a = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    a.init(sceneA, 'deterministic-seed', defaultParams);
    const ptsA = sceneA.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posA = ptsA.geometry.getAttribute('position');

    const sceneB = new THREE.Scene();
    const b = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    b.init(sceneB, 'deterministic-seed', defaultParams);
    const ptsB = sceneB.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posB = ptsB.geometry.getAttribute('position');

    expect(posA.count).toBe(posB.count);
    for (let i = 0; i < posA.count * 3; i++) {
      expect(posA.array[i]).toBe(posB.array[i]);
    }
  });

  it('T-074-17: different seeds produce different terrain heights', () => {
    const sceneA = new THREE.Scene();
    const a = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    a.init(sceneA, 'seed-alpha', defaultParams);
    const ptsA = sceneA.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posA = ptsA.geometry.getAttribute('position');

    const sceneB = new THREE.Scene();
    const b = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    b.init(sceneB, 'seed-beta', defaultParams);
    const ptsB = sceneB.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posB = ptsB.geometry.getAttribute('position');

    let differ = false;
    for (let i = 0; i < posA.count; i++) {
      if (posA.getY(i) !== posB.getY(i)) {
        differ = true;
        break;
      }
    }
    expect(differ).toBe(true);
  });

  // ─── Uniform Declaration ───

  it('T-074-19: vertex material declares required audio-reactive uniforms', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'uniform-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    const required = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uOpacity', 'uMotionAmplitude',
      'uPointerDisturbance', 'uPointerPos', 'uPaletteHue', 'uPaletteSaturation',
      'uCadence', 'uNoiseFrequency', 'uNoiseOctaves',
      'uFogNear', 'uFogFar',
    ];
    for (const u of required) {
      expect(mat.uniforms[u], `missing uniform ${u} on vertex material`).toBeDefined();
    }
  });

  it('T-074-20: config noiseOctaves is passed to uNoiseOctaves uniform', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000, noiseOctaves: 1 });
    terrain.init(scene, 'octaves-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNoiseOctaves.value).toBe(1);
  });

  // ─── Draw & Uniform Updates ───

  it('T-074-21: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'safe-seed', defaultParams);
    expect(() => terrain.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-074-22: draw() updates uTime uniform to reflect frame elapsed time', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'time-seed', defaultParams);
    terrain.draw(scene, makeFrame({ elapsed: 4200 }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTime.value).toBe(4200);
  });

  it('T-074-23: draw() updates uBassEnergy on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'bass-seed', defaultParams);

    terrain.draw(scene, makeFrame({ params: { bassEnergy: 0 } }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const vertMat = pts.material as THREE.ShaderMaterial;
    expect(vertMat.uniforms.uBassEnergy.value).toBe(0);

    terrain.draw(scene, makeFrame({ params: { bassEnergy: 1.0 } }));
    expect(vertMat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-074-24: draw() updates uTrebleEnergy on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'treble-seed', defaultParams);

    terrain.draw(scene, makeFrame({ params: { trebleEnergy: 0 } }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const vertMat = pts.material as THREE.ShaderMaterial;
    expect(vertMat.uniforms.uTrebleEnergy.value).toBe(0);

    terrain.draw(scene, makeFrame({ params: { trebleEnergy: 1.0 } }));
    expect(vertMat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-074-25: draw() updates paletteHue uniform from frame params', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'hue-seed', defaultParams);

    terrain.draw(scene, makeFrame({ params: { paletteHue: 0 } }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    terrain.draw(scene, makeFrame({ params: { paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-074-26: draw() updates fog uniforms (uFogNear, uFogFar)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'fog-seed', defaultParams);
    terrain.draw(scene, makeFrame());
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uFogNear).toBeDefined();
    expect(mat.uniforms.uFogFar).toBeDefined();
    expect(typeof mat.uniforms.uFogNear.value).toBe('number');
    expect(typeof mat.uniforms.uFogFar.value).toBe('number');
  });

  it('T-074-27: all uniform values remain finite after draw with extreme audio params', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'finite-seed', defaultParams);
    terrain.draw(scene, makeFrame({
      elapsed: 10000,
      params: { bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 },
    }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    for (const [name, uniform] of Object.entries(mat.uniforms)) {
      if (typeof uniform.value === 'number') {
        expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
      }
    }
  });

  // ─── Camera Framing / Perspective Depth ───

  it('T-074-28: terrain meshes are positioned/rotated for perspective depth (not at origin with identity orientation)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'camera-seed', defaultParams);

    const allChildren = scene.children;
    let hasTransform = false;
    for (const child of allChildren) {
      const p = child.position;
      const r = child.rotation;
      if (p.x !== 0 || p.y !== 0 || p.z !== 0 ||
          r.x !== 0 || r.y !== 0 || r.z !== 0) {
        hasTransform = true;
        break;
      }
      if (child instanceof THREE.Group) {
        hasTransform = true;
        break;
      }
    }
    expect(hasTransform).toBe(true);
  });

  // ─── Shader Validation ───

  it('T-074-29: vertex shader includes noise3d declarations (snoise or fbm3 symbols)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'noise-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/snoise|fbm3/);
  });

  it('T-074-30: vertex shader declares fog varying vFogFactor', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'fog-vary-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/vFogFactor/);
  });

  it('T-074-31: fragment shader receives vFogFactor for depth fog', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'frag-fog-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/vFogFactor/);
  });

  // ─── Lifecycle Management ───

  it('T-074-32: setOpacity updates uOpacity on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'opacity-seed', defaultParams);
    terrain.setOpacity!(0.5);

    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);

    terrain.setOpacity!(0);
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
  });

  it('T-074-33: cleanup() removes all LineSegments and Points from scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments || c instanceof THREE.Points || c instanceof THREE.Group).length).toBeGreaterThan(0);

    terrain.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
  });

  it('T-074-34: cleanup() disposes geometry and materials', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'dispose-seed', defaultParams);

    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    const geoSpies = points.map((p) => vi.spyOn(p.geometry, 'dispose'));
    const matSpies = points.map((p) => vi.spyOn(p.material as THREE.Material, 'dispose'));

    terrain.cleanup!();

    for (const spy of geoSpies) {
      expect(spy).toHaveBeenCalled();
    }
    for (const spy of matSpies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('T-074-35: cleanup after init with no draws does not throw', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'early-cleanup-seed', defaultParams);
    expect(() => terrain.cleanup!()).not.toThrow();
  });

  it('T-074-36: multiple draw calls do not leak objects into the scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'leak-seed', defaultParams);
    const childCount = scene.children.length;
    for (let i = 0; i < 10; i++) {
      terrain.draw(scene, makeFrame({ elapsed: i * 100 }));
    }
    expect(scene.children.length).toBe(childCount);
  });

  // ─── Quality Tier Scaling ───

  it('T-074-37: different pointCount configs produce different vertex counts (quality scaling)', () => {
    const sceneLow = new THREE.Scene();
    const low = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    low.init(sceneLow, 'quality-seed', defaultParams);
    const ptsLow = sceneLow.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const countLow = ptsLow.geometry.getAttribute('position').count;

    const sceneHigh = new THREE.Scene();
    const high = createTerrainHeightfield({ rows: 40, cols: 60, pointCount: 60000 });
    high.init(sceneHigh, 'quality-seed', defaultParams);
    const ptsHigh = sceneHigh.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const countHigh = ptsHigh.geometry.getAttribute('position').count;

    expect(countHigh).toBeGreaterThan(countLow);
  });

  // ─── Edge Cases & Boundaries ───

  it('T-074-40: draw does not throw with zero audio params and no pointer', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    terrain.init(scene, 'edge-seed', params);
    expect(() => terrain.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-074-41: baseline rendering — terrain renders meaningful geometry with zero audio energy', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'baseline-seed', {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
    });
    terrain.draw(scene, makeFrame({ params: { bassEnergy: 0, trebleEnergy: 0 } }));

    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const pos = pts.geometry.getAttribute('position');
    expect(pos.count).toBeGreaterThan(0);

    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(maxY - minY).toBeGreaterThan(0.01);
  });

  it('T-074-42: motionAmplitude uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'motion-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;

    terrain.draw(scene, makeFrame({ elapsed: 100, params: { motionAmplitude: 0.2 } }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    terrain.draw(scene, makeFrame({ elapsed: 100, params: { motionAmplitude: 1.0 } }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  // ─── Privacy / Forbidden APIs ───

  it('T-074-43: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'privacy-seed', defaultParams);
    terrain.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-074-45: boundary values (density=0/1, structureComplexity=0/1) do not throw', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
    ];
    for (const b of boundaries) {
      const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
      const params = { ...defaultParams, ...b };
      expect(() => {
        terrain.init(scene, 'boundary-seed', params);
        terrain.draw(scene, makeFrame({ params }));
      }).not.toThrow();
      terrain.cleanup!();
    }
  });
});

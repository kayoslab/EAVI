import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import type { VisualParams } from '../../../src/visual/mappings';
import type { FrameState } from '../../../src/visual/types';
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

describe('US-076: Dense particle wave sheet system (replaces wireframe terrain)', () => {
  // ─── Core Requirement: No LineSegments, Only Points ───

  it('T-076-S01: init() does NOT add any THREE.LineSegments to the scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'no-lines-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBe(0);
  });

  it('T-076-S02: init() adds exactly one THREE.Points mesh to the scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'points-only-seed', defaultParams);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(points.length).toBe(1);
  });

  // ─── Point Count Matches Tier ───

  it('T-076-S03: low tier pointCount (~20k) produces geometry with ~20000 vertices', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 20, cols: 30, pointCount: 20000 });
    terrain.init(scene, 'low-tier-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posCount = pts.geometry.getAttribute('position').count;
    expect(posCount).toBe(20000);
  });

  it('T-076-S04: medium tier pointCount (~60k) produces geometry with ~60000 vertices', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 40, cols: 60, pointCount: 60000 });
    terrain.init(scene, 'mid-tier-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posCount = pts.geometry.getAttribute('position').count;
    expect(posCount).toBe(60000);
  });

  it('T-076-S05: high tier pointCount (~120k) produces geometry with ~120000 vertices', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 60, cols: 90, pointCount: 120000 });
    terrain.init(scene, 'high-tier-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posCount = pts.geometry.getAttribute('position').count;
    expect(posCount).toBe(120000);
  });

  // ─── Geometry Attributes ───

  it('T-076-S06: Points geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'pos-attr-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posAttr = pts.geometry.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBe(5000);
  });

  it('T-076-S07: Points geometry has aRandom attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'rand-attr-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const aRandom = pts.geometry.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });

  it('T-076-S08: Points geometry has aVertexColor attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'color-attr-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const aVertexColor = pts.geometry.getAttribute('aVertexColor');
    expect(aVertexColor).toBeDefined();
    expect(aVertexColor.itemSize).toBe(3);
  });

  it('T-076-S09: all position values are finite', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'finite-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos = pts.geometry.getAttribute('position');
    for (let i = 0; i < pos.count * 3; i++) {
      expect(Number.isFinite(pos.array[i]), `position[${i}] is not finite`).toBe(true);
    }
  });

  // ─── Material Properties ───

  it('T-076-S10: Points use ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'shader-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-076-S11: material is transparent with AdditiveBlending and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'blend-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  // ─── Uniform Declaration ───

  it('T-076-S12: vertex material declares all required audio-reactive uniforms', () => {
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

  it('T-076-S13: config noiseOctaves is passed to uNoiseOctaves uniform', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000, noiseOctaves: 1 });
    terrain.init(scene, 'octaves-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNoiseOctaves.value).toBe(1);
  });

  // ─── Draw & Uniform Updates ───

  it('T-076-S14: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'safe-seed', defaultParams);
    expect(() => terrain.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-076-S15: draw() updates uTime uniform to reflect frame elapsed time', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'time-seed', defaultParams);
    terrain.draw(scene, makeFrame({ elapsed: 4200 }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTime.value).toBe(4200);
  });

  it('T-076-S16: draw() updates uBassEnergy on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'bass-seed', defaultParams);

    terrain.draw(scene, makeFrame({ params: { bassEnergy: 0 } }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    terrain.draw(scene, makeFrame({ params: { bassEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-076-S17: draw() updates uTrebleEnergy on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'treble-seed', defaultParams);

    terrain.draw(scene, makeFrame({ params: { trebleEnergy: 0 } }));
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    terrain.draw(scene, makeFrame({ params: { trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-076-S18: draw() updates paletteHue uniform from frame params', () => {
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

  it('T-076-S19: all uniform values remain finite after draw with extreme audio params', () => {
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

  it('T-076-S20: motionAmplitude uniform reflects param on draw', () => {
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

  // ─── Camera Framing / Low-angle Perspective ───

  it('T-076-S21: terrain mesh is positioned/rotated for low-angle perspective (not at origin)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 5000 });
    terrain.init(scene, 'camera-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const p = pts.position;
    const r = pts.rotation;
    const hasTransform = p.x !== 0 || p.y !== 0 || p.z !== 0 ||
                         r.x !== 0 || r.y !== 0 || r.z !== 0;
    expect(hasTransform).toBe(true);
  });

  // ─── Shader Validation ───

  it('T-076-S22: vertex shader includes noise3d declarations (snoise or fbm3 symbols)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'noise-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/snoise|fbm3/);
  });

  it('T-076-S23: vertex shader declares fog varying vFogFactor', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'fog-vary-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/vFogFactor/);
  });

  it('T-076-S24: fragment shader receives vFogFactor for depth fog', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'frag-fog-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/vFogFactor/);
  });

  it('T-076-S25: vertex shader references uTime for continuous wave animation', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'wave-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    // Shader must use uTime for time-based wave animation
    expect(mat.vertexShader).toMatch(/uTime/);
  });

  it('T-076-S26: vertex shader references uBassEnergy for wave amplitude modulation', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'bass-shader-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/uBassEnergy/);
  });

  it('T-076-S27: vertex shader references uTrebleEnergy for shimmer', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'treble-shader-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/uTrebleEnergy/);
  });

  it('T-076-S28: fragment shader uses gl_PointCoord for soft round sprite', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'sprite-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/gl_PointCoord/);
  });

  it('T-076-S29: vertex shader sets gl_PointSize for point rendering', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'ptsize-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/gl_PointSize/);
  });

  // ─── Determinism ───

  it('T-076-S30: same seed produces identical geometry (deterministic)', () => {
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

  it('T-076-S31: different seeds produce different terrain', () => {
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

  // ─── Jitter Verification (No Visible Grid Pattern) ───

  it('T-076-S32: points are not aligned to grid intersections (jittered XZ)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 20, cols: 20, pointCount: 10000 });
    terrain.init(scene, 'jitter-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pos = pts.geometry.getAttribute('position');

    // Collect unique X values rounded to 3 decimal places
    const xValues = new Set<number>();
    for (let i = 0; i < pos.count; i++) {
      xValues.add(Math.round(pos.getX(i) * 1000) / 1000);
    }
    // If points were on a 21-column grid, there'd be at most 21 unique X values.
    // With jitter, there should be many more unique X values.
    expect(xValues.size).toBeGreaterThan(100);
  });

  // ─── Lifecycle Management ───

  it('T-076-S33: setOpacity updates uOpacity on vertex material', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'opacity-seed', defaultParams);
    terrain.setOpacity!(0.5);

    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);

    terrain.setOpacity!(0);
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
  });

  it('T-076-S34: cleanup() removes all Points from scene', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBeGreaterThan(0);

    terrain.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
  });

  it('T-076-S35: cleanup() disposes geometry and material', () => {
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

  it('T-076-S36: cleanup after init with no draws does not throw', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'early-cleanup-seed', defaultParams);
    expect(() => terrain.cleanup!()).not.toThrow();
  });

  it('T-076-S37: multiple draw calls do not leak objects into the scene', () => {
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

  it('T-076-S38: different pointCount configs produce different vertex counts', () => {
    const sceneLow = new THREE.Scene();
    const low = createTerrainHeightfield({ rows: 20, cols: 30, pointCount: 20000 });
    low.init(sceneLow, 'quality-seed', defaultParams);
    const ptsLow = sceneLow.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const countLow = ptsLow.geometry.getAttribute('position').count;

    const sceneHigh = new THREE.Scene();
    const high = createTerrainHeightfield({ rows: 60, cols: 90, pointCount: 120000 });
    high.init(sceneHigh, 'quality-seed', defaultParams);
    const ptsHigh = sceneHigh.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const countHigh = ptsHigh.geometry.getAttribute('position').count;

    expect(countHigh).toBeGreaterThan(countLow);
    expect(countHigh / countLow).toBeGreaterThan(4);
  });

  // ─── Edge Cases & Boundaries ───

  it('T-076-S39: draw does not throw with zero audio params and no pointer', () => {
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

  it('T-076-S40: baseline rendering — terrain renders meaningful geometry with zero audio energy', () => {
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

    // Verify Y-axis variation exists (static heightfield is not flat)
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    expect(maxY - minY).toBeGreaterThan(0.01);
  });

  // ─── Privacy / Forbidden APIs ───

  it('T-076-S41: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 8, cols: 8, pointCount: 5000 });
    terrain.init(scene, 'privacy-seed', defaultParams);
    terrain.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-076-S42: boundary param values (density=0/1, structureComplexity=0/1) do not throw', () => {
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

  // ─── Terrain XZ Span ───

  it('T-076-S43: terrain spans X and Z axes (grid extent > 0 in both)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 10000 });
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

  it('T-076-S44: terrain has height variation in Y axis (not flat plane)', () => {
    const scene = new THREE.Scene();
    const terrain = createTerrainHeightfield({ rows: 10, cols: 10, pointCount: 10000 });
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
});

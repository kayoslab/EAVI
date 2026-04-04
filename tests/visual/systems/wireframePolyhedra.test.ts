import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createWireframePolyhedra } from '../../../src/visual/systems/wireframePolyhedra';
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

describe('US-054: Wireframe polyhedra geometry system', () => {
  it('T-054-01: init() adds THREE.LineSegments to the scene (not Points or Mesh)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'line-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(points.length).toBe(0);
  });

  it('T-054-02: LineSegments geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'pos-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(line).toBeDefined();
    const geo = line.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(0);
  });

  it('T-054-03: LineSegments use ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'shader-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-054-04: at least 4 base shapes are supported — sweep seeds to find icosahedron, octahedron, dodecahedron, tetrahedron vertex counts', () => {
    const scene = new THREE.Scene();
    const vertCounts = new Set<number>();
    for (let i = 0; i < 100; i++) {
      const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
      wire.init(scene, `shape-sweep-${i}`, defaultParams);
      const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
      const lastLine = lines[lines.length - 1] as THREE.LineSegments;
      const geo = lastLine.geometry as THREE.BufferGeometry;
      vertCounts.add(geo.getAttribute('position').count);
      wire.cleanup!();
    }
    expect(vertCounts.size).toBeGreaterThanOrEqual(4);
  });

  it('T-054-05: same seed produces same number of LineSegments (deterministic)', () => {
    const sceneA = new THREE.Scene();
    const a = createWireframePolyhedra();
    a.init(sceneA, 'deterministic-seed', defaultParams);
    const countA = sceneA.children.filter((c) => c instanceof THREE.LineSegments).length;

    const sceneB = new THREE.Scene();
    const b = createWireframePolyhedra();
    b.init(sceneB, 'deterministic-seed', defaultParams);
    const countB = sceneB.children.filter((c) => c instanceof THREE.LineSegments).length;

    expect(countA).toBe(countB);
  });

  it('T-054-06: default maxPolyhedra creates 6 LineSegments', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'default-count-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBe(6);
  });

  it('T-054-07: maxPolyhedra=3 creates exactly 3 LineSegments (no computeAdaptiveCount floor)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'low-tier-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBe(3);
  });

  it('T-054-08: maxPolyhedra=12 creates exactly 12 LineSegments', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 12 });
    wire.init(scene, 'high-tier-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(lines.length).toBe(12);
  });

  it('T-054-09: material declares required audio-reactive uniforms (no uBasePointSize, no uHasSizeAttr)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'uniform-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    const requiredUniforms = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uOpacity', 'uMotionAmplitude',
      'uPointerDisturbance', 'uPointerPos', 'uPaletteHue', 'uPaletteSaturation',
      'uCadence', 'uBreathScale', 'uNoiseFrequency', 'uRadialScale',
      'uTwistStrength', 'uFieldSpread', 'uNoiseOctaves',
      'uEnablePointerRepulsion', 'uEnableSlowModulation',
      'uDisplacementScale', 'uFogNear', 'uFogFar',
    ];
    for (const u of requiredUniforms) {
      expect(mat.uniforms[u], `missing uniform ${u}`).toBeDefined();
    }
    // Should NOT have point-only uniforms
    expect(mat.uniforms['uBasePointSize']).toBeUndefined();
    expect(mat.uniforms['uHasSizeAttr']).toBeUndefined();
  });

  it('T-054-10: material is transparent with AdditiveBlending and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'blend-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-054-11: vertex shader includes noise3d declarations (snoise or fbm3 symbols)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'noise-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/snoise|fbm3/);
  });

  it('T-054-12: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'safe-seed', defaultParams);
    expect(() => wire.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-054-13: draw() updates uTime uniform to reflect frame elapsed time', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'time-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    wire.draw(scene, makeFrame({ time: 200, elapsed: 200 }));
    expect(mat.uniforms.uTime.value).toBe(200);
  });

  it('T-054-14: draw() updates uBassEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'bass-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;

    wire.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    wire.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-054-15: draw() updates uTrebleEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'treble-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;

    wire.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    wire.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-054-16: draw() updates fog uniforms (uFogNear, uFogFar)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'fog-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    wire.draw(scene, makeFrame());
    expect(mat.uniforms.uFogNear).toBeDefined();
    expect(mat.uniforms.uFogFar).toBeDefined();
    expect(typeof mat.uniforms.uFogNear.value).toBe('number');
    expect(typeof mat.uniforms.uFogFar.value).toBe('number');
  });

  it('T-054-17: paletteHue uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;

    wire.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    wire.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-054-18: motionAmplitude uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'motion-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;

    wire.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2 } }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    wire.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0 } }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  it('T-054-19: setOpacity updates uOpacity uniform on all materials for crossfade', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'opacity-seed', defaultParams);
    wire.setOpacity!(0.5);

    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    for (const line of lines) {
      const mat = line.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uOpacity.value).toBe(0.5);
    }

    wire.setOpacity!(0);
    for (const line of lines) {
      const mat = line.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uOpacity.value).toBe(0);
    }
  });

  it('T-054-20: cleanup() removes all LineSegments from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'cleanup-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    expect(lines.length).toBe(3);

    const geoSpies = lines.map((l) => vi.spyOn(l.geometry, 'dispose'));
    const matSpies = lines.map((l) => vi.spyOn(l.material as THREE.Material, 'dispose'));

    wire.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    for (const spy of geoSpies) {
      expect(spy).toHaveBeenCalled();
    }
    for (const spy of matSpies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('T-054-21: each polyhedron is positioned in 3D space (non-zero positions)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 6 });
    wire.init(scene, 'position-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    let hasNonOrigin = false;
    for (const line of lines) {
      const pos = line.position;
      if (pos.x !== 0 || pos.y !== 0 || pos.z !== 0) {
        hasNonOrigin = true;
        break;
      }
    }
    expect(hasNonOrigin).toBe(true);
  });

  it('T-054-22: polyhedra are placed volumetrically (span X, Y, and Z axes)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 12 });
    wire.init(scene, 'volume-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    let hasX = false, hasY = false, hasZ = false;
    for (const line of lines) {
      if (Math.abs(line.position.x) > 0.1) hasX = true;
      if (Math.abs(line.position.y) > 0.1) hasY = true;
      if (Math.abs(line.position.z) > 0.1) hasZ = true;
    }
    expect(hasX).toBe(true);
    expect(hasY).toBe(true);
    expect(hasZ).toBe(true);
  });

  it('T-054-23: geometry has aRandom attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'random-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });

  it('T-054-24: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    wire.init(scene, 'edge-seed', params);
    expect(() => wire.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-054-25: boundary values (density=0, density=1, structureComplexity=0/1) do not throw', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
    ];
    for (const b of boundaries) {
      const wire = createWireframePolyhedra();
      const params = { ...defaultParams, ...b };
      expect(() => {
        wire.init(scene, 'boundary-seed', params);
        wire.draw(scene, makeFrame({ params }));
      }).not.toThrow();
      wire.cleanup!();
    }
  });

  it('T-054-26: multiple draw calls do not leak objects into the scene', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'leak-seed', defaultParams);
    const childCount = scene.children.length;
    for (let i = 0; i < 10; i++) {
      wire.draw(scene, makeFrame({ elapsed: i * 100 }));
    }
    expect(scene.children.length).toBe(childCount);
  });

  it('T-054-27: wireframe edges use small polyhedra (bounding radius < 0.5 before placement)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'size-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    geo.computeBoundingSphere();
    expect(geo.boundingSphere!.radius).toBeLessThan(0.5);
  });

  it('T-054-28: EdgesGeometry produces clean wireframe (even vertex count for line pairs)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'edges-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    const posCount = geo.getAttribute('position').count;
    // LineSegments requires pairs of vertices
    expect(posCount % 2).toBe(0);
    expect(posCount).toBeGreaterThanOrEqual(6); // minimum tetrahedron has 6 edges = 12 verts
  });

  it('T-054-29: all uniform values remain finite after draw with extreme audio params', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'finite-seed', defaultParams);
    wire.draw(scene, makeFrame({ elapsed: 10000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    for (const [name, uniform] of Object.entries(mat.uniforms)) {
      if (typeof uniform.value === 'number') {
        expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
      }
    }
  });

  it('T-054-30: different seeds produce different shape selections (vertex counts vary)', () => {
    const scene = new THREE.Scene();
    const vertCounts = new Set<number>();
    for (const seed of ['shape-a', 'shape-b', 'shape-c', 'shape-d', 'shape-e', 'shape-f', 'shape-g', 'shape-h']) {
      const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
      wire.init(scene, seed, defaultParams);
      const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
      const lastLine = lines[lines.length - 1] as THREE.LineSegments;
      vertCounts.add(lastLine.geometry.getAttribute('position').count);
      wire.cleanup!();
    }
    expect(vertCounts.size).toBeGreaterThanOrEqual(2);
  });

  it('T-054-31: polyhedra have initial rotations applied (not all identity orientation)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 6 });
    wire.init(scene, 'rotation-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    let hasRotation = false;
    for (const line of lines) {
      const r = line.rotation;
      if (r.x !== 0 || r.y !== 0 || r.z !== 0) {
        hasRotation = true;
        break;
      }
    }
    expect(hasRotation).toBe(true);
  });

  it('T-054-32: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'privacy-seed', defaultParams);
    wire.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-054-33: config noiseOctaves is passed to uNoiseOctaves uniform', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ noiseOctaves: 1 });
    wire.init(scene, 'octaves-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uNoiseOctaves.value).toBe(1);
  });

  it('T-054-34: config enablePointerRepulsion is passed to uEnablePointerRepulsion uniform', () => {
    const scene = new THREE.Scene();
    const wireOff = createWireframePolyhedra({ enablePointerRepulsion: false });
    wireOff.init(scene, 'ptr-seed', defaultParams);
    const lineOff = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const matOff = lineOff.material as THREE.ShaderMaterial;
    expect(matOff.uniforms.uEnablePointerRepulsion.value).toBe(0.0);
    wireOff.cleanup!();

    const wireOn = createWireframePolyhedra({ enablePointerRepulsion: true });
    wireOn.init(scene, 'ptr-seed', defaultParams);
    const lineOn = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const matOn = lineOn.material as THREE.ShaderMaterial;
    expect(matOn.uniforms.uEnablePointerRepulsion.value).toBe(1.0);
  });

  it('T-054-35: config enableSlowModulation is passed to uEnableSlowModulation uniform', () => {
    const scene = new THREE.Scene();
    const wireOff = createWireframePolyhedra({ enableSlowModulation: false });
    wireOff.init(scene, 'mod-seed', defaultParams);
    const lineOff = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const matOff = lineOff.material as THREE.ShaderMaterial;
    expect(matOff.uniforms.uEnableSlowModulation.value).toBe(0.0);
  });

  it('T-054-36: vertex shader declares fog-related varying (vFogFactor, not vDepth)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'fog-vary-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/vFogFactor/);
  });

  it('T-054-37: fragment shader receives vFogFactor for depth fog', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'frag-fog-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/vFogFactor/);
  });

  it('T-054-38: cleanup after init with no draws does not throw', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'early-cleanup-seed', defaultParams);
    expect(() => wire.cleanup!()).not.toThrow();
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
  });

  it('T-054-39: all materials across polyhedra share same uniform set', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 6 });
    wire.init(scene, 'shared-uniform-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const firstKeys = Object.keys((lines[0].material as THREE.ShaderMaterial).uniforms).sort();
    for (let i = 1; i < lines.length; i++) {
      const keys = Object.keys((lines[i].material as THREE.ShaderMaterial).uniforms).sort();
      expect(keys).toEqual(firstKeys);
    }
  });

  it('T-054-40: draw updates uniforms on ALL polyhedra materials (not just first)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'all-update-seed', defaultParams);
    wire.draw(scene, makeFrame({ elapsed: 5000, params: { ...defaultParams, bassEnergy: 0.9 } }));
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    for (const line of lines) {
      const mat = line.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uBassEnergy.value).toBe(0.9);
      expect(mat.uniforms.uTime.value).toBe(5000);
    }
  });
});

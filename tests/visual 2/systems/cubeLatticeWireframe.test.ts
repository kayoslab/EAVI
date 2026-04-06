import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCubeLatticeWireframe } from '../../../src/visual/systems/cubeLatticeWireframe';
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

describe('US-068: Cube lattice wireframe system', () => {
  it('T-068-17: init() adds THREE.LineSegments and THREE.Points to the scene', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'lattice-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(points.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBe(points.length);
  });

  it('T-068-18: LineSegments geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'pos-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(line).toBeDefined();
    const geo = line.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(0);
  });

  it('T-068-19: Points geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'pts-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(pts).toBeDefined();
    const geo = pts.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(0);
  });

  it('T-068-20: geometry has aRandom attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'rand-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lineRandom = (line.geometry as THREE.BufferGeometry).getAttribute('aRandom');
    const ptsRandom = (pts.geometry as THREE.BufferGeometry).getAttribute('aRandom');
    expect(lineRandom).toBeDefined();
    expect(lineRandom.itemSize).toBe(3);
    expect(ptsRandom).toBeDefined();
    expect(ptsRandom.itemSize).toBe(3);
  });

  it('T-068-21: LineSegments use ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'shader-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-068-22: material is transparent with AdditiveBlending and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'blend-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-068-23: material declares required audio-reactive uniforms', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'uniform-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    const required = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uOpacity', 'uMotionAmplitude',
      'uPointerDisturbance', 'uPointerPos', 'uPaletteHue', 'uPaletteSaturation',
      'uCadence', 'uNoiseFrequency', 'uRadialScale', 'uTwistStrength', 'uFieldSpread',
      'uNoiseOctaves', 'uEnablePointerRepulsion', 'uEnableSlowModulation',
      'uDisplacementScale', 'uFogNear', 'uFogFar',
    ];
    for (const name of required) {
      expect(u[name]).toBeDefined();
    }
  });

  it('T-068-24: draw() updates uTime uniform to reflect frame elapsed time', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'time-seed', defaultParams);
    sys.draw(scene, makeFrame({ elapsed: 200 }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    expect(u.uTime.value).toBe(200);
  });

  it('T-068-25: draw() updates uBassEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'bass-seed', defaultParams);

    sys.draw(scene, makeFrame({ params: { bassEnergy: 0 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    expect(u.uBassEnergy.value).toBe(0);

    sys.draw(scene, makeFrame({ params: { bassEnergy: 1.0 } }));
    expect(u.uBassEnergy.value).toBe(1.0);
  });

  it('T-068-26: draw() updates uTrebleEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'treble-seed', defaultParams);

    sys.draw(scene, makeFrame({ params: { trebleEnergy: 0 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    expect(u.uTrebleEnergy.value).toBe(0);

    sys.draw(scene, makeFrame({ params: { trebleEnergy: 1.0 } }));
    expect(u.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-068-27: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'nothrow-seed', defaultParams);
    expect(() => sys.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-068-28: draw() does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'edge-seed', defaultParams);
    const frame = makeFrame({ params: { bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 } });
    delete (frame as Record<string, unknown>).pointerX;
    delete (frame as Record<string, unknown>).pointerY;
    expect(() => sys.draw(scene, frame)).not.toThrow();
  });

  it('T-068-29: setOpacity updates uOpacity uniform on all materials', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'opacity-seed', defaultParams);

    sys.setOpacity(0.5);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((line.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.5);

    sys.setOpacity(0);
    expect((line.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
    expect((pts.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0);
  });

  it('T-068-30: cleanup() removes all objects from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'cleanup-seed', defaultParams);

    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeLine = vi.spyOn(line.geometry, 'dispose');
    const matDisposeLine = vi.spyOn(line.material as THREE.Material, 'dispose');
    const geoDisposePts = vi.spyOn(pts.geometry, 'dispose');
    const matDisposePts = vi.spyOn(pts.material as THREE.Material, 'dispose');

    sys.cleanup();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeLine).toHaveBeenCalled();
    expect(matDisposeLine).toHaveBeenCalled();
    expect(geoDisposePts).toHaveBeenCalled();
    expect(matDisposePts).toHaveBeenCalled();
  });

  it('T-068-31: cleanup after init with no draws does not throw', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'early-cleanup', defaultParams);
    expect(() => sys.cleanup()).not.toThrow();
  });

  it('T-068-32: same seed produces same geometry (deterministic init)', () => {
    const sceneA = new THREE.Scene();
    const a = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    a.init(sceneA, 'det-seed', defaultParams);

    const sceneB = new THREE.Scene();
    const b = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    b.init(sceneB, 'det-seed', defaultParams);

    const lineA = sceneA.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const lineB = sceneB.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((lineA.geometry as THREE.BufferGeometry).getAttribute('position').count)
      .toBe((lineB.geometry as THREE.BufferGeometry).getAttribute('position').count);

    const ptsA = sceneA.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const ptsB = sceneB.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect((ptsA.geometry as THREE.BufferGeometry).getAttribute('position').count)
      .toBe((ptsB.geometry as THREE.BufferGeometry).getAttribute('position').count);
  });

  it('T-068-33: multiple draw calls do not leak objects into the scene', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'leak-seed', defaultParams);
    const initialCount = scene.children.length;
    for (let i = 0; i < 10; i++) {
      sys.draw(scene, makeFrame({ elapsed: i * 16 }));
    }
    expect(scene.children.length).toBe(initialCount);
  });

  it('T-068-34: all uniform values remain finite after draw with extreme audio params', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'extreme-seed', defaultParams);
    sys.draw(scene, makeFrame({
      params: { bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0, pointerDisturbance: 1.0 },
    }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    for (const key of Object.keys(u)) {
      const val = u[key].value;
      if (typeof val === 'number') {
        expect(Number.isFinite(val)).toBe(true);
      }
    }
  });

  it('T-068-35: vertex shader includes noise3d declarations (snoise or fbm3 symbols)', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'noise-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const vs = (line.material as THREE.ShaderMaterial).vertexShader;
    expect(vs).toMatch(/snoise|fbm3/);
  });

  it('T-068-36: vertex shader declares fog-related varying (vFogFactor)', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'fog-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line.material as THREE.ShaderMaterial).vertexShader).toMatch(/vFogFactor/);
  });

  it('T-068-37: fragment shader receives vFogFactor for depth fog', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'fogfrag-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line.material as THREE.ShaderMaterial).fragmentShader).toMatch(/vFogFactor/);
  });

  it('T-068-38: config noiseOctaves is passed to uNoiseOctaves uniform', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, noiseOctaves: 1 });
    sys.init(scene, 'octaves-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line.material as THREE.ShaderMaterial).uniforms.uNoiseOctaves.value).toBe(1);
  });

  it('T-068-39: config enablePointerRepulsion is passed to uEnablePointerRepulsion uniform', () => {
    const scene1 = new THREE.Scene();
    const sys1 = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enablePointerRepulsion: false });
    sys1.init(scene1, 'ptr-off', defaultParams);
    const line1 = scene1.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line1.material as THREE.ShaderMaterial).uniforms.uEnablePointerRepulsion.value).toBe(0.0);

    const scene2 = new THREE.Scene();
    const sys2 = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enablePointerRepulsion: true });
    sys2.init(scene2, 'ptr-on', defaultParams);
    const line2 = scene2.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line2.material as THREE.ShaderMaterial).uniforms.uEnablePointerRepulsion.value).toBe(1.0);
  });

  it('T-068-40: config enableSlowModulation is passed to uEnableSlowModulation uniform', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableSlowModulation: false });
    sys.init(scene, 'mod-off', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect((line.material as THREE.ShaderMaterial).uniforms.uEnableSlowModulation.value).toBe(0.0);
  });

  it('T-068-51: no localStorage or cookie access during cube lattice init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');

    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'privacy-seed', defaultParams);
    sys.draw(scene, makeFrame());

    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();

    lsSpy.mockRestore();
    cookieSpy.mockRestore();
  });

  it('T-068-52: LineSegments vertex count is even (valid line pairs)', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'even-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const count = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    expect(count % 2).toBe(0);
    expect(count).toBeGreaterThanOrEqual(24); // 1x1x1 = 12 edges = 24 verts min
  });

  it('T-068-53: draw updates uniforms on ALL materials (edges and vertices)', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'both-seed', defaultParams);
    sys.draw(scene, makeFrame({ elapsed: 500, params: { bassEnergy: 0.7 } }));

    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const eu = (line.material as THREE.ShaderMaterial).uniforms;
    const vu = (pts.material as THREE.ShaderMaterial).uniforms;

    expect(eu.uBassEnergy.value).toBe(0.7);
    expect(vu.uBassEnergy.value).toBe(0.7);
    expect(eu.uTime.value).toBe(500);
    expect(vu.uTime.value).toBe(500);
  });

  it('T-068-54: boundary values (density=0/1, structureComplexity=0/1) do not throw', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'boundary-seed', { ...defaultParams, density: 0, structureComplexity: 0 });
    expect(() => sys.draw(scene, makeFrame({ params: { density: 0, structureComplexity: 0 } }))).not.toThrow();

    sys.cleanup();
    sys.init(scene, 'boundary-seed2', { ...defaultParams, density: 1, structureComplexity: 1 });
    expect(() => sys.draw(scene, makeFrame({ params: { density: 1, structureComplexity: 1 } }))).not.toThrow();
  });

  it('T-068-55: gridSize config controls vertex count in resulting geometry', () => {
    const scene3 = new THREE.Scene();
    const sys3 = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys3.init(scene3, 'size-3', defaultParams);

    const scene5 = new THREE.Scene();
    const sys5 = createCubeLatticeWireframe({ gridSize: 5, cellSize: 1.0 });
    sys5.init(scene5, 'size-5', defaultParams);

    const pts3 = scene3.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pts5 = scene5.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const count3 = (pts3.geometry as THREE.BufferGeometry).getAttribute('position').count;
    const count5 = (pts5.geometry as THREE.BufferGeometry).getAttribute('position').count;
    expect(count3).toBeLessThan(count5);
  });

  it('T-068-56: paletteHue uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'hue-seed', defaultParams);

    sys.draw(scene, makeFrame({ params: { paletteHue: 0 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u = (line.material as THREE.ShaderMaterial).uniforms;
    expect(u.uPaletteHue.value).toBe(0);

    sys.draw(scene, makeFrame({ params: { paletteHue: 270 } }));
    expect(u.uPaletteHue.value).toBe(270);
  });

  it('T-068-57: motionAmplitude uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'motion-seed', defaultParams);

    sys.draw(scene, makeFrame({ params: { motionAmplitude: 0.2 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const u1 = (line.material as THREE.ShaderMaterial).uniforms.uMotionAmplitude.value;

    sys.draw(scene, makeFrame({ params: { motionAmplitude: 1.0 } }));
    const u2 = (line.material as THREE.ShaderMaterial).uniforms.uMotionAmplitude.value;

    expect(u1).toBeLessThan(u2);
  });
});

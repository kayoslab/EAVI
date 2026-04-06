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

describe('US-065: Vertex-and-edge topology — paired Points + LineSegments', () => {
  // --- Both mesh types present ---

  it('T-065-31: init() adds both THREE.LineSegments AND THREE.Points to the scene', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'vertex-edge-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(points.length).toBeGreaterThanOrEqual(1);
  });

  it('T-065-32: default config creates 6 LineSegments AND 6 Points (one per polyhedron)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'count-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBe(6);
    expect(points.length).toBe(6);
  });

  it('T-065-33: maxPolyhedra=3 creates exactly 3 LineSegments AND 3 Points', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'three-pair-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
    const points = scene.children.filter((c) => c instanceof THREE.Points);
    expect(lines.length).toBe(3);
    expect(points.length).toBe(3);
  });

  // --- Vertex dot geometry ---

  it('T-065-34: Points geometry has position attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-pos-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    expect(point).toBeDefined();
    const geo = point.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(0);
  });

  it('T-065-35: Points geometry has aRandom attribute with itemSize 3', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-random-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = point.geometry as THREE.BufferGeometry;
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });

  it('T-065-36: Points vertex count is less than LineSegments vertex count (deduplicated)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'dedup-count-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lineCount = (line.geometry as THREE.BufferGeometry).getAttribute('position').count;
    const pointCount = (point.geometry as THREE.BufferGeometry).getAttribute('position').count;
    expect(pointCount).toBeLessThan(lineCount);
    expect(pointCount).toBeGreaterThanOrEqual(4); // minimum tetrahedron = 4 vertices
  });

  // --- Points material ---

  it('T-065-37: Points use ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-shader-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-065-38: Points material is transparent with AdditiveBlending and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-blend-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-065-39: Points material has uBasePointSize uniform (edges material does not)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'pointsize-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const pointMat = point.material as THREE.ShaderMaterial;
    expect(pointMat.uniforms.uBasePointSize).toBeDefined();
    expect(typeof pointMat.uniforms.uBasePointSize.value).toBe('number');

    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const lineMat = line.material as THREE.ShaderMaterial;
    expect(lineMat.uniforms.uBasePointSize).toBeUndefined();
  });

  it('T-065-40: Points material declares audio-reactive uniforms', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-uniforms-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    const requiredUniforms = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uOpacity',
      'uMotionAmplitude', 'uPaletteHue', 'uPaletteSaturation',
      'uFogNear', 'uFogFar', 'uBasePointSize',
    ];
    for (const u of requiredUniforms) {
      expect(mat.uniforms[u], `missing uniform ${u}`).toBeDefined();
    }
  });

  it('T-065-41: Points vertex shader includes noise3d declarations (snoise or fbm3)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'point-noise-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/snoise|fbm3/);
  });

  it('T-065-42: Points vertex shader declares gl_PointSize', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'pointsize-shader-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/gl_PointSize/);
  });

  it('T-065-43: Points fragment shader uses gl_PointCoord for soft circular shape', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'pointcoord-seed', defaultParams);
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = point.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/gl_PointCoord/);
  });

  // --- Position and rotation pairing ---

  it('T-065-44: paired Points and LineSegments share the same world position', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'pair-position-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    expect(lines.length).toBe(points.length);
    for (let i = 0; i < lines.length; i++) {
      expect(points[i].position.x).toBe(lines[i].position.x);
      expect(points[i].position.y).toBe(lines[i].position.y);
      expect(points[i].position.z).toBe(lines[i].position.z);
    }
  });

  it('T-065-45: paired Points and LineSegments share the same rotation', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'pair-rotation-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    for (let i = 0; i < lines.length; i++) {
      expect(points[i].rotation.x).toBe(lines[i].rotation.x);
      expect(points[i].rotation.y).toBe(lines[i].rotation.y);
      expect(points[i].rotation.z).toBe(lines[i].rotation.z);
    }
  });

  // --- draw() updates both materials ---

  it('T-065-46: draw() updates uniforms on both LineSegments AND Points materials', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2 });
    wire.init(scene, 'draw-both-seed', defaultParams);
    wire.draw(scene, makeFrame({ elapsed: 5000, params: { ...defaultParams, bassEnergy: 0.8 } }));

    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];

    for (const line of lines) {
      const mat = line.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
      expect(mat.uniforms.uTime.value).toBe(5000);
    }
    for (const point of points) {
      const mat = point.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
      expect(mat.uniforms.uTime.value).toBe(5000);
    }
  });

  it('T-065-47: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'draw-safe-seed', defaultParams);
    expect(() => wire.draw(scene, makeFrame())).not.toThrow();
  });

  // --- setOpacity ---

  it('T-065-48: setOpacity updates uOpacity on both LineSegments AND Points materials', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2 });
    wire.init(scene, 'opacity-both-seed', defaultParams);
    wire.setOpacity!(0.3);

    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    for (const line of lines) {
      expect((line.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.3);
    }
    for (const point of points) {
      expect((point.material as THREE.ShaderMaterial).uniforms.uOpacity.value).toBe(0.3);
    }
  });

  // --- cleanup ---

  it('T-065-49: cleanup() removes all LineSegments AND Points from scene', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'cleanup-both-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(3);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(3);

    wire.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
  });

  it('T-065-50: cleanup() disposes geometry and material for both mesh types', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2 });
    wire.init(scene, 'dispose-both-seed', defaultParams);

    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];

    const geoSpies = [...lines, ...points].map((m) => vi.spyOn(m.geometry, 'dispose'));
    const matSpies = [...lines, ...points].map((m) => vi.spyOn(m.material as THREE.Material, 'dispose'));

    wire.cleanup!();

    for (const spy of geoSpies) {
      expect(spy).toHaveBeenCalled();
    }
    for (const spy of matSpies) {
      expect(spy).toHaveBeenCalled();
    }
  });

  it('T-065-51: cleanup after init with no draws does not throw', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'early-cleanup-seed', defaultParams);
    expect(() => wire.cleanup!()).not.toThrow();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
  });

  // --- No scene leaks ---

  it('T-065-52: multiple draw calls do not leak objects into the scene', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'leak-seed', defaultParams);
    const childCount = scene.children.length;
    for (let i = 0; i < 10; i++) {
      wire.draw(scene, makeFrame({ elapsed: i * 100 }));
    }
    expect(scene.children.length).toBe(childCount);
  });

  // --- Deformation pipeline identity ---

  it('T-065-53: Points and LineSegments vertex shaders share the same deformation uniforms', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'deform-uniform-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const point = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const lineMat = line.material as THREE.ShaderMaterial;
    const pointMat = point.material as THREE.ShaderMaterial;

    // All deformation-related uniforms must be present on both
    const deformUniforms = [
      'uTime', 'uBassEnergy', 'uTrebleEnergy', 'uMotionAmplitude',
      'uNoiseFrequency', 'uRadialScale', 'uTwistStrength', 'uFieldSpread',
      'uBreathScale', 'uNoiseOctaves', 'uDisplacementScale',
    ];
    for (const u of deformUniforms) {
      expect(lineMat.uniforms[u], `edge missing ${u}`).toBeDefined();
      expect(pointMat.uniforms[u], `vertex missing ${u}`).toBeDefined();
    }
  });

  // --- Determinism ---

  it('T-065-54: same seed produces same number of LineSegments and Points (deterministic)', () => {
    const sceneA = new THREE.Scene();
    const a = createWireframePolyhedra();
    a.init(sceneA, 'det-seed', defaultParams);
    const linesA = sceneA.children.filter((c) => c instanceof THREE.LineSegments).length;
    const pointsA = sceneA.children.filter((c) => c instanceof THREE.Points).length;

    const sceneB = new THREE.Scene();
    const b = createWireframePolyhedra();
    b.init(sceneB, 'det-seed', defaultParams);
    const linesB = sceneB.children.filter((c) => c instanceof THREE.LineSegments).length;
    const pointsB = sceneB.children.filter((c) => c instanceof THREE.Points).length;

    expect(linesA).toBe(linesB);
    expect(pointsA).toBe(pointsB);
  });

  // --- Privacy ---

  it('T-065-55: no localStorage or cookie access during init/draw with vertex-edge topology', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'privacy-vertex-seed', defaultParams);
    wire.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  // --- Finite values ---

  it('T-065-56: all Points position values are finite', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 3 });
    wire.init(scene, 'finite-point-seed', defaultParams);
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    for (const point of points) {
      const pos = (point.geometry as THREE.BufferGeometry).getAttribute('position');
      for (let v = 0; v < pos.count * 3; v++) {
        expect(Number.isFinite((pos.array as Float32Array)[v])).toBe(true);
      }
    }
  });

  it('T-065-57: all uniform values remain finite after draw with extreme audio params', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra();
    wire.init(scene, 'finite-uniform-seed', defaultParams);
    wire.draw(scene, makeFrame({ elapsed: 10000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 } }));
    const points = scene.children.filter((c) => c instanceof THREE.Points) as THREE.Points[];
    for (const point of points) {
      const mat = point.material as THREE.ShaderMaterial;
      for (const [name, uniform] of Object.entries(mat.uniforms)) {
        if (typeof uniform.value === 'number') {
          expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
        }
      }
    }
  });

  // --- Generation modes produce paired meshes ---

  it('T-065-58: all generation modes produce paired Points + LineSegments across seed sweep', () => {
    for (let i = 0; i < 20; i++) {
      const scene = new THREE.Scene();
      const wire = createWireframePolyhedra({ maxPolyhedra: 1, maxEdgesPerShape: 1920 });
      wire.init(scene, `mode-pair-sweep-${i}`, defaultParams);
      const lines = scene.children.filter((c) => c instanceof THREE.LineSegments);
      const points = scene.children.filter((c) => c instanceof THREE.Points);
      expect(lines.length).toBe(1);
      expect(points.length).toBe(1);
      wire.cleanup!();
    }
  });
});

import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createWireframePolyhedra } from '../../../src/visual/systems/wireframePolyhedra';
import { createConstellationLines, getActiveVertexCount } from '../../../src/visual/systems/constellationLines';
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

function generateMockPositions(count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.sin(i * 0.73) * 3);
    positions[i * 3 + 1] = (Math.cos(i * 0.91) * 3);
    positions[i * 3 + 2] = (Math.sin(i * 1.17) * 3);
  }
  return positions;
}

describe('US-060: Wireframe polyhedra with electric arc', () => {
  it('T-060-30: arc-enabled wireframe creates LineSegments with aEdgeParam attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    const param = geo.getAttribute('aEdgeParam');
    expect(param).toBeDefined();
    expect(param.itemSize).toBe(1);
  });

  it('T-060-31: arc-enabled wireframe creates LineSegments with aEdgeTangent attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-tangent-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    const tangent = geo.getAttribute('aEdgeTangent');
    expect(tangent).toBeDefined();
    expect(tangent.itemSize).toBe(3);
  });

  it('T-060-32: arc-enabled wireframe has more vertices than non-arc (subdivision increases count)', () => {
    const sceneArc = new THREE.Scene();
    const wireArc = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wireArc.init(sceneArc, 'compare-seed', defaultParams);
    const lineArc = sceneArc.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const arcCount = lineArc.geometry.getAttribute('position').count;

    const sceneNorm = new THREE.Scene();
    const wireNorm = createWireframePolyhedra({ maxPolyhedra: 1 });
    wireNorm.init(sceneNorm, 'compare-seed', defaultParams);
    const lineNorm = sceneNorm.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const normCount = lineNorm.geometry.getAttribute('position').count;

    expect(arcCount).toBeGreaterThan(normCount);
  });

  it('T-060-33: arc-disabled wireframe does NOT have aEdgeParam attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1 });
    wire.init(scene, 'no-arc-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('aEdgeParam')).toBeUndefined();
  });

  it('T-060-34: arc-enabled ShaderMaterial has uArcIntensity uniform', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-uni-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uArcIntensity).toBeDefined();
    expect(typeof mat.uniforms.uArcIntensity.value).toBe('number');
  });

  it('T-060-35: arc-enabled ShaderMaterial has uArcSpeed uniform', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-speed-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uArcSpeed).toBeDefined();
    expect(typeof mat.uniforms.uArcSpeed.value).toBe('number');
  });

  it('T-060-36: arc-enabled ShaderMaterial has uArcFrequency uniform', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-freq-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uArcFrequency).toBeDefined();
    expect(typeof mat.uniforms.uArcFrequency.value).toBe('number');
  });

  it('T-060-37: draw() updates uArcIntensity from treble energy', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-draw-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;

    wire.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    const low = mat.uniforms.uArcIntensity.value;

    wire.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 1.0 } }));
    const high = mat.uniforms.uArcIntensity.value;

    expect(high).toBeGreaterThan(low);
  });

  it('T-060-38: draw() updates uTime on arc-enabled wireframe', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-time-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    wire.draw(scene, makeFrame({ elapsed: 5000 }));
    expect(mat.uniforms.uTime.value).toBe(5000);
  });

  it('T-060-39: arc vertex shader includes noise declarations (snoise or fbm3)', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-noise-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/snoise|fbm3/);
  });

  it('T-060-40: arc vertex shader declares aEdgeParam attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-attr-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/attribute\s+float\s+aEdgeParam/);
  });

  it('T-060-41: arc vertex shader declares aEdgeTangent attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-tangent-attr-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toMatch(/attribute\s+vec3\s+aEdgeTangent/);
  });

  it('T-060-42: arc fragment shader includes vArcDisplacement varying for glow', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-frag-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toMatch(/vArcDisplacement/);
  });

  it('T-060-43: arc-enabled wireframe cleanup disposes geometry and material', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-cleanup-seed', defaultParams);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    const geoSpies = lines.map((l) => vi.spyOn(l.geometry, 'dispose'));
    const matSpies = lines.map((l) => vi.spyOn(l.material as THREE.Material, 'dispose'));

    wire.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    for (const spy of geoSpies) expect(spy).toHaveBeenCalled();
    for (const spy of matSpies) expect(spy).toHaveBeenCalled();
  });

  it('T-060-44: arc-enabled wireframe uses AdditiveBlending and transparent', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-blend-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-060-45: arc-enabled wireframe retains aRandom attribute', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-random-seed', defaultParams);
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = line.geometry as THREE.BufferGeometry;
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });

  it('T-060-46: all arc uniform values remain finite after draw with extreme params', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-finite-seed', defaultParams);
    wire.draw(scene, makeFrame({ elapsed: 100000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 } }));
    const line = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = line.material as THREE.ShaderMaterial;
    for (const [name, uniform] of Object.entries(mat.uniforms)) {
      if (typeof uniform.value === 'number') {
        expect(Number.isFinite(uniform.value), `uniform ${name} is not finite`).toBe(true);
      }
    }
  });

  it('T-060-47: setOpacity works on arc-enabled wireframe', () => {
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 2, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-opacity-seed', defaultParams);
    wire.setOpacity!(0.3);
    const lines = scene.children.filter((c) => c instanceof THREE.LineSegments) as THREE.LineSegments[];
    for (const line of lines) {
      const mat = line.material as THREE.ShaderMaterial;
      expect(mat.uniforms.uOpacity.value).toBe(0.3);
    }
  });

  it('T-060-48: no localStorage or cookie access with arc enabled', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const wire = createWireframePolyhedra({ maxPolyhedra: 1, enableElectricArc: true, arcSubdivisions: 5 });
    wire.init(scene, 'arc-privacy-seed', defaultParams);
    wire.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

describe('US-060: Constellation lines with electric arc', () => {
  it('T-060-50: arc-enabled constellation has aEdgeParam attribute', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const param = geo.getAttribute('aEdgeParam');
    expect(param).toBeDefined();
    expect(param.itemSize).toBe(1);
  });

  it('T-060-51: arc-enabled constellation has aEdgeTangent attribute', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const tangent = geo.getAttribute('aEdgeTangent');
    expect(tangent).toBeDefined();
    expect(tangent.itemSize).toBe(3);
  });

  it('T-060-52: arc-enabled constellation retains aDistance attribute', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const dist = geo.getAttribute('aDistance');
    expect(dist).toBeDefined();
    expect(dist.itemSize).toBe(1);
  });

  it('T-060-53: arc-enabled constellation has more vertices than non-arc', () => {
    const positions = generateMockPositions(100);

    const sceneArc = new THREE.Scene();
    const arcConst = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    arcConst.init(sceneArc, positions, defaultParams);
    const arcLines = sceneArc.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const arcCount = arcLines.geometry.getAttribute('position').count;

    const sceneNorm = new THREE.Scene();
    const normConst = createConstellationLines();
    normConst.init(sceneNorm, positions, defaultParams);
    const normLines = sceneNorm.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const normCount = normLines.geometry.getAttribute('position').count;

    expect(arcCount).toBeGreaterThan(normCount);
  });

  it('T-060-54: arc-enabled constellation has arc uniforms', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uArcIntensity).toBeDefined();
    expect(mat.uniforms.uArcSpeed).toBeDefined();
    expect(mat.uniforms.uArcFrequency).toBeDefined();
  });

  it('T-060-55: arc-disabled constellation does NOT have aEdgeParam attribute', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('aEdgeParam')).toBeUndefined();
  });

  it('T-060-56: draw() updates arc uniforms on constellation', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;

    constellation.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.9 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.9);
  });

  it('T-060-57: arc-enabled constellation cleanup disposes resources', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geoSpy = vi.spyOn(lines.geometry, 'dispose');
    const matSpy = vi.spyOn(lines.material as THREE.Material, 'dispose');

    constellation.cleanup!();

    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-060-58: no localStorage or cookie access with arc-enabled constellation', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ enableElectricArc: true, arcSubdivisions: 5 });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    constellation.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

describe('US-060: Quality profile electric arc settings', () => {
  it('T-060-60: QualityProfile includes enableElectricArc field', () => {
    // Importing dynamically to test the interface

    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 1920, screenHeight: 1080,
      devicePixelRatio: 2, hardwareConcurrency: 8, prefersColorScheme: 'dark',
      prefersReducedMotion: false, touchCapable: false, deviceMemory: 8,
    };
    const result = computeQuality(signals);
    expect(result).toHaveProperty('enableElectricArc');
    expect(typeof result.enableElectricArc).toBe('boolean');
  });

  it('T-060-61: QualityProfile includes arcSubdivisions field', () => {

    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 1920, screenHeight: 1080,
      devicePixelRatio: 2, hardwareConcurrency: 8, prefersColorScheme: 'dark',
      prefersReducedMotion: false, touchCapable: false, deviceMemory: 8,
    };
    const result = computeQuality(signals);
    expect(result).toHaveProperty('arcSubdivisions');
    expect(typeof result.arcSubdivisions).toBe('number');
  });

  it('T-060-62: low tier disables electric arc', () => {

    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 320, screenHeight: 568,
      devicePixelRatio: 1, hardwareConcurrency: 2, prefersColorScheme: 'dark',
      prefersReducedMotion: false, touchCapable: true, deviceMemory: 1,
    };
    const result = computeQuality(signals);
    expect(result.tier).toBe('low');
    expect(result.enableElectricArc).toBe(false);
    expect(result.arcSubdivisions).toBe(0);
  });

  it('T-060-63: medium tier enables electric arc with moderate subdivisions', () => {

    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 390, screenHeight: 844,
      devicePixelRatio: 2, hardwareConcurrency: 4, prefersColorScheme: 'dark',
      prefersReducedMotion: false, touchCapable: true, deviceMemory: 4,
    };
    const result = computeQuality(signals);
    expect(result.tier).toBe('medium');
    expect(result.enableElectricArc).toBe(true);
    expect(result.arcSubdivisions).toBe(5);
  });

  it('T-060-64: high tier enables electric arc with high subdivisions', () => {

    const signals = {
      language: 'en', timezone: 'UTC', screenWidth: 2560, screenHeight: 1440,
      devicePixelRatio: 2, hardwareConcurrency: 16, prefersColorScheme: 'dark',
      prefersReducedMotion: false, touchCapable: false, deviceMemory: 8,
    };
    const result = computeQuality(signals);
    expect(result.tier).toBe('high');
    expect(result.enableElectricArc).toBe(true);
    expect(result.arcSubdivisions).toBe(8);
  });

  it('T-060-65: arcSubdivisions scales with tier (low < medium < high)', () => {

    const low = computeQuality({ language: 'en', timezone: 'UTC', screenWidth: 320, screenHeight: 568, devicePixelRatio: 1, hardwareConcurrency: 2, prefersColorScheme: 'dark', prefersReducedMotion: false, touchCapable: true, deviceMemory: 1 });
    const medium = computeQuality({ language: 'en', timezone: 'UTC', screenWidth: 390, screenHeight: 844, devicePixelRatio: 2, hardwareConcurrency: 4, prefersColorScheme: 'dark', prefersReducedMotion: false, touchCapable: true, deviceMemory: 4 });
    const high = computeQuality({ language: 'en', timezone: 'UTC', screenWidth: 2560, screenHeight: 1440, devicePixelRatio: 2, hardwareConcurrency: 16, prefersColorScheme: 'dark', prefersReducedMotion: false, touchCapable: false, deviceMemory: 8 });

    expect(low.arcSubdivisions).toBeLessThan(medium.arcSubdivisions);
    expect(medium.arcSubdivisions).toBeLessThan(high.arcSubdivisions);
  });
});

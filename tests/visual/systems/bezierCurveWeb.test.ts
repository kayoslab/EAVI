import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createBezierCurveWeb } from '../../../src/visual/systems/bezierCurveWeb';
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

function makeFrame(overrides?: Partial<FrameState>): FrameState {
  return {
    time: 1000,
    delta: 16,
    elapsed: 1000,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
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

describe('US-067: BezierCurveWeb', () => {
  it('T-067-11: init() adds a THREE.LineSegments mesh to the scene', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(1);
  });

  it('T-067-12: LineSegments mesh has BufferGeometry with position, aArcOffset, aEdgeParam, and aDistance attributes', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;

    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);

    const arcAttr = geo.getAttribute('aArcOffset');
    expect(arcAttr).toBeDefined();
    expect(arcAttr.itemSize).toBe(3);

    const edgeAttr = geo.getAttribute('aEdgeParam');
    expect(edgeAttr).toBeDefined();
    expect(edgeAttr.itemSize).toBe(1);

    const distAttr = geo.getAttribute('aDistance');
    expect(distAttr).toBeDefined();
    expect(distAttr.itemSize).toBe(1);
  });

  it('T-067-13: curves are tessellated into configurable segments per connection', () => {
    const scene = new THREE.Scene();
    const segments = 5;
    const web = createBezierCurveWeb({ segments });
    web.init(scene, generateMockPositions(100), defaultParams);
    // activeVertexCount should be a multiple of segments * 2
    expect(web.activeVertexCount % (segments * 2)).toBe(0);
    expect(web.activeVertexCount).toBeGreaterThan(0);
  });

  it('T-067-14: connection pairs are selected from a subset (not all-to-all) to control density', () => {
    const scene = new THREE.Scene();
    const maxConnections = 50;
    const segments = 5;
    const web = createBezierCurveWeb({ maxConnections, segments, proximityThreshold: 100 });
    web.init(scene, generateMockPositions(200), defaultParams);
    // Connections = activeVertexCount / (segments * 2)
    const connectionCount = web.activeVertexCount / (segments * 2);
    expect(connectionCount).toBeLessThanOrEqual(maxConnections);
    // Much less than all-to-all: 200*(200-1)/2 = 19900
    expect(connectionCount).toBeLessThan(200);
  });

  it('T-067-15: material uses ShaderMaterial with transparent, additive blending, depthWrite false', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-067-16: material has uOpacity uniform with low initial value (0.05-0.15 range)', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uOpacity).toBeDefined();
    expect(mat.uniforms.uOpacity.value).toBeGreaterThanOrEqual(0.05);
    expect(mat.uniforms.uOpacity.value).toBeLessThanOrEqual(0.15);
  });

  it('T-067-17: bass energy modulates arc curvature via uBassArcScale uniform', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;

    expect(mat.uniforms.uBassArcScale).toBeDefined();

    web.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    const scaleLow = mat.uniforms.uBassArcScale.value;

    web.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0 } }));
    const scaleHigh = mat.uniforms.uBassArcScale.value;

    expect(scaleLow).toBeLessThan(scaleHigh);
    expect(Number.isFinite(scaleLow)).toBe(true);
    expect(Number.isFinite(scaleHigh)).toBe(true);
  });

  it('T-067-18: draw() updates standard uniforms (uTime, uBassEnergy, uTrebleEnergy, uPaletteHue)', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;

    const params = { ...defaultParams, bassEnergy: 0.5, trebleEnergy: 0.7, paletteHue: 270 };
    web.draw(scene, makeFrame({ elapsed: 4200, params }));

    expect(mat.uniforms.uTime.value).toBe(4200);
    expect(mat.uniforms.uBassEnergy.value).toBe(0.5);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.7);
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-067-19: setOpacity updates uOpacity uniform', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;

    web.setOpacity(0.3);
    expect(mat.uniforms.uOpacity.value).toBe(0.3);
    web.setOpacity(0);
    expect(mat.uniforms.uOpacity.value).toBe(0);
  });

  it('T-067-20: cleanup() removes mesh from scene and disposes geometry and material', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(1);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geoDisposeSpy = vi.spyOn(lines.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(lines.material as THREE.Material, 'dispose');
    web.cleanup();
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-067-21: init with null positions does not throw (graceful skip)', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    expect(() => web.init(scene, null as unknown as Float32Array, defaultParams)).not.toThrow();
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(0);
    expect(web.activeVertexCount).toBe(0);
  });

  it('T-067-22: init with fewer than 2 points produces no connections', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, new Float32Array([1, 2, 3]), defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(0);
    expect(web.activeVertexCount).toBe(0);
  });

  it('T-067-23: vertex shader source includes aArcOffset attribute declaration', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('aArcOffset');
    expect(mat.vertexShader).toContain('uBassArcScale');
  });

  it('T-067-24: connection count adapts to maxConnections config (quality tier adaptation)', () => {
    const scene = new THREE.Scene();
    const segments = 5;
    const positions = generateMockPositions(200);

    const webLow = createBezierCurveWeb({ maxConnections: 50, segments, proximityThreshold: 100 });
    webLow.init(scene, positions, defaultParams);
    const lowCount = webLow.activeVertexCount;

    const webHigh = createBezierCurveWeb({ maxConnections: 500, segments, proximityThreshold: 100 });
    webHigh.init(scene, positions, defaultParams);
    const highCount = webHigh.activeVertexCount;

    expect(lowCount).toBeLessThanOrEqual(highCount);
    expect(lowCount).toBeLessThanOrEqual(50 * segments * 2);
  });

  it('T-067-25: line positions exist in 3D space (Z values vary, not coplanar)', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posArr = (lines.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;

    let hasNonZeroZ = false;
    for (let i = 0; i < posArr.length; i += 3) {
      expect(Number.isFinite(posArr[i])).toBe(true);
      expect(Number.isFinite(posArr[i + 1])).toBe(true);
      expect(Number.isFinite(posArr[i + 2])).toBe(true);
      if (posArr[i + 2] !== 0) hasNonZeroZ = true;
    }
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-067-26: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(50), defaultParams);
    expect(() => web.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-067-27: draw() does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(50), defaultParams);
    const params = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    expect(() => web.draw(scene, makeFrame({ params, pointerX: undefined, pointerY: undefined }))).not.toThrow();
  });

  it('T-067-28: same positions produce same connection topology (deterministic)', () => {
    const scene = new THREE.Scene();
    const positions = generateMockPositions(80);

    const a = createBezierCurveWeb();
    a.init(scene, positions, defaultParams);
    const countA = a.activeVertexCount;

    const b = createBezierCurveWeb();
    b.init(scene, positions, defaultParams);
    const countB = b.activeVertexCount;

    expect(countA).toBe(countB);
  });

  it('T-067-29: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(50), defaultParams);
    web.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-067-30: BezierCurveWeb implements the Overlay interface (init, draw, cleanup, setOpacity, activeVertexCount)', () => {
    const web = createBezierCurveWeb();
    expect(typeof web.init).toBe('function');
    expect(typeof web.draw).toBe('function');
    expect(typeof web.cleanup).toBe('function');
    expect(typeof web.setOpacity).toBe('function');
    expect(typeof web.activeVertexCount).toBe('number');
  });

  it('T-067-31: fog uniforms are present for depth fog integration', () => {
    const scene = new THREE.Scene();
    const web = createBezierCurveWeb();
    web.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uFogNear !== undefined || mat.uniforms.uFogFar !== undefined).toBeTruthy();
  });

  it('T-067-32: boundary values (proximityThreshold=0, maxConnections=0) do not throw', () => {
    const scene = new THREE.Scene();
    const positions = generateMockPositions(50);

    const zeroThreshold = createBezierCurveWeb({ proximityThreshold: 0 });
    expect(() => zeroThreshold.init(scene, positions, defaultParams)).not.toThrow();
    expect(zeroThreshold.activeVertexCount).toBe(0);

    const zeroMax = createBezierCurveWeb({ maxConnections: 0 });
    expect(() => zeroMax.init(scene, positions, defaultParams)).not.toThrow();
    expect(zeroMax.activeVertexCount).toBe(0);
  });
});

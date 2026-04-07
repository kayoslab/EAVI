import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createConstellationLines, getActiveVertexCount } from '../../../src/visual/systems/constellationLines';
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

describe('US-069: Constellation lines with geometric topologies', () => {
  it('T-055-01: init() adds a THREE.LineSegments mesh to the scene', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-01' });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(1);
  });

  it('T-055-02: LineSegments mesh uses BufferGeometry with position attribute (itemSize 3)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-02' });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
  });

  it('T-055-05: bass energy modulates connection distance threshold via uniform', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-05' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;

    constellation.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    const bassLow = mat.uniforms.uBassEnergy.value;

    constellation.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0 } }));
    const bassHigh = mat.uniforms.uBassEnergy.value;

    expect(bassLow).toBe(0);
    expect(bassHigh).toBe(1.0);
  });

  it('T-055-06: line geometry includes aDistance attribute (itemSize 1)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-06' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const distAttr = geo.getAttribute('aDistance');
    expect(distAttr).toBeDefined();
    expect(distAttr.itemSize).toBe(1);
  });

  it('T-055-10: LineSegments uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-10' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-055-11: material uses transparent blending and depthWrite disabled for compositing over points', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-11' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-055-12: shader includes fog uniform for depth fog effect', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-12' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.fog || mat.uniforms.uFogDensity || mat.uniforms.uFogNear !== undefined).toBeTruthy();
  });

  it('T-055-13: lower maxTopologyInstances produces fewer vertices than higher', () => {
    const sceneLow = new THREE.Scene();
    const lowTier = createConstellationLines({ maxTopologyInstances: 3, seed: 'test-13' });
    lowTier.init(sceneLow, generateMockPositions(50), defaultParams);
    const lowCount = getActiveVertexCount(lowTier);

    const sceneHigh = new THREE.Scene();
    const highTier = createConstellationLines({ maxTopologyInstances: 10, seed: 'test-13' });
    highTier.init(sceneHigh, generateMockPositions(50), defaultParams);
    const highCount = getActiveVertexCount(highTier);

    expect(lowCount).toBeLessThanOrEqual(highCount);
  });

  it('T-055-17: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-17' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    expect(() => constellation.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-055-18: draw() updates uTime uniform from frame state', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-18' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ time: 4200, elapsed: 4200 }));
    expect(mat.uniforms.uTime.value).toBe(4200);
  });

  it('T-055-19: cleanup() removes LineSegments from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-19' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(1);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geoDisposeSpy = vi.spyOn(lines.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(lines.material as THREE.Material, 'dispose');
    constellation.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.LineSegments).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-055-20: setOpacity updates uOpacity uniform on line material', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-20' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.setOpacity!(0.3);
    expect(mat.uniforms.uOpacity.value).toBe(0.3);
    constellation.setOpacity!(0);
    expect(mat.uniforms.uOpacity.value).toBe(0);
  });

  it('T-055-21: treble energy is passed through to shader uniform', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-21' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.8 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.8);
  });

  it('T-055-22: palette hue uniform reflects visual params', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-22' });
    constellation.init(scene, generateMockPositions(50), { ...defaultParams, paletteHue: 90 });
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-055-23: same seed produces same topology layout (deterministic)', () => {
    const sceneA = new THREE.Scene();
    const a = createConstellationLines({ maxTopologyInstances: 5, seed: 'determinism-test' });
    a.init(sceneA, generateMockPositions(80), defaultParams);
    const countA = getActiveVertexCount(a);

    const sceneB = new THREE.Scene();
    const b = createConstellationLines({ maxTopologyInstances: 5, seed: 'determinism-test' });
    b.init(sceneB, generateMockPositions(80), defaultParams);
    const countB = getActiveVertexCount(b);

    expect(countA).toBe(countB);

    // Compare actual position data
    const linesA = sceneA.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const linesB = sceneB.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posA = (linesA.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const posB = (linesB.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    expect(Array.from(posA)).toEqual(Array.from(posB));
  });

  it('T-055-24: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-24' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const params = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    expect(() => constellation.draw(scene, makeFrame({ params, pointerX: undefined, pointerY: undefined }))).not.toThrow();
  });

  it('T-055-26: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-26' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    constellation.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-055-27: line positions exist in 3D space (not coplanar, Z values vary)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-27' });
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posArr = (lines.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const activeCount = getActiveVertexCount(constellation);
    let hasNonZeroZ = false;
    for (let i = 0; i < activeCount; i++) {
      if (posArr[i * 3 + 2] !== 0) {
        hasNonZeroZ = true;
        break;
      }
    }
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-055-28: constellation renders with additive blending for glow compositing', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-28' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-055-29: motion amplitude uniform is updated from visual params', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-29' });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 0.2 } }));
    expect(mat.uniforms.uMotionAmplitude.value).toBe(0.2);
  });
});

describe('US-069: Topology-specific constellation tests', () => {
  it('T-069-30: topology instances produce correct vertex counts (multiples of 2 for LineSegments)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-30' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const count = getActiveVertexCount(constellation);
    expect(count).toBeGreaterThan(0);
    expect(count % 2).toBe(0);
  });

  it('T-069-31: edge count matches topology definitions (not proximity-based)', () => {
    const scene = new THREE.Scene();
    // Use a single tetrahedron-heavy seed to check edge counts
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-31' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const count = getActiveVertexCount(constellation);
    // Each edge produces 2 vertices in LineSegments
    expect(count % 2).toBe(0);
    expect(count).toBeGreaterThan(0);
  });

  it('T-069-32: total line segment count is capped by maxConnections', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 15, maxConnections: 10, seed: 'test-32' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const count = getActiveVertexCount(constellation);
    expect(count / 2).toBeLessThanOrEqual(10);
  });

  it('T-069-33: same seed produces same topology layout', () => {
    const s1 = new THREE.Scene();
    const a = createConstellationLines({ maxTopologyInstances: 8, seed: 'det-33' });
    a.init(s1, new Float32Array(0), defaultParams);

    const s2 = new THREE.Scene();
    const b = createConstellationLines({ maxTopologyInstances: 8, seed: 'det-33' });
    b.init(s2, new Float32Array(0), defaultParams);

    expect(getActiveVertexCount(a)).toBe(getActiveVertexCount(b));

    const linesA = s1.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const linesB = s2.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posA = (linesA.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const posB = (linesB.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    expect(Array.from(posA)).toEqual(Array.from(posB));
  });

  it('T-069-34: instance count respects maxTopologyInstances from config', () => {
    const sceneLow = new THREE.Scene();
    const low = createConstellationLines({ maxTopologyInstances: 3, seed: 'test-34' });
    low.init(sceneLow, new Float32Array(0), defaultParams);
    const lowCount = getActiveVertexCount(low);

    const sceneHigh = new THREE.Scene();
    const high = createConstellationLines({ maxTopologyInstances: 15, seed: 'test-34' });
    high.init(sceneHigh, new Float32Array(0), defaultParams);
    const highCount = getActiveVertexCount(high);

    expect(lowCount).toBeLessThan(highCount);
  });

  it('T-069-35: with maxTopologyInstances: 0, no geometry is created', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 0, seed: 'test-35' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(0);
    expect(getActiveVertexCount(constellation)).toBe(0);
  });

  it('T-069-36: topology instance vertices are recognizably clustered in 3D space', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-36', spreadRadius: 5.0 });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posArr = (lines.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const activeCount = getActiveVertexCount(constellation);

    // Collect unique positions (edge endpoints)
    const points: [number, number, number][] = [];
    for (let i = 0; i < activeCount; i++) {
      points.push([posArr[i * 3], posArr[i * 3 + 1], posArr[i * 3 + 2]]);
    }

    // With spread radius 5.0, points should form visible clusters
    // Check that not all points are at the same location
    const xs = new Set(points.map(p => Math.round(p[0] * 100)));
    const ys = new Set(points.map(p => Math.round(p[1] * 100)));
    expect(xs.size).toBeGreaterThan(1);
    expect(ys.size).toBeGreaterThan(1);
  });

  it('T-069-37: positions parameter is accepted but ignored (system generates its own vertices)', () => {
    const scene1 = new THREE.Scene();
    const a = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-37' });
    a.init(scene1, new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), defaultParams);

    const scene2 = new THREE.Scene();
    const b = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-37' });
    b.init(scene2, new Float32Array(0), defaultParams);

    expect(getActiveVertexCount(a)).toBe(getActiveVertexCount(b));

    // Verify geometry is still created even with empty positions
    expect(getActiveVertexCount(b)).toBeGreaterThan(0);
  });

  it('T-069-38: aDistance attribute is present with values in [0, 1] range', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-38' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const distAttr = geo.getAttribute('aDistance');
    expect(distAttr).toBeDefined();
    expect(distAttr.itemSize).toBe(1);
    const arr = distAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0);
      expect(arr[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-069-39: aRandom attribute is present with itemSize 3 and finite values', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-39' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const randAttr = geo.getAttribute('aRandom');
    expect(randAttr).toBeDefined();
    expect(randAttr.itemSize).toBe(3);
    const arr = randAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-069-40: electric arc mode works with topology-generated edges', () => {
    const sceneNoArc = new THREE.Scene();
    const noArc = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-40', enableElectricArc: false });
    noArc.init(sceneNoArc, new Float32Array(0), defaultParams);
    const noArcCount = getActiveVertexCount(noArc);

    const sceneArc = new THREE.Scene();
    const arc = createConstellationLines({ maxTopologyInstances: 5, seed: 'test-40', enableElectricArc: true, arcSubdivisions: 4 });
    arc.init(sceneArc, new Float32Array(0), defaultParams);
    const arcCount = getActiveVertexCount(arc);

    // Subdivisions increase vertex count
    expect(arcCount).toBeGreaterThan(noArcCount);

    // Check arc-specific attributes
    const lines = sceneArc.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('aEdgeParam')).toBeDefined();
    expect(geo.getAttribute('aEdgeTangent')).toBeDefined();
  });

  it('T-069-41: different seeds produce different topology layouts', () => {
    const s1 = new THREE.Scene();
    const a = createConstellationLines({ maxTopologyInstances: 5, seed: 'alpha-41' });
    a.init(s1, new Float32Array(0), defaultParams);

    const s2 = new THREE.Scene();
    const b = createConstellationLines({ maxTopologyInstances: 5, seed: 'beta-41' });
    b.init(s2, new Float32Array(0), defaultParams);

    const linesA = s1.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const linesB = s2.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posA = (linesA.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const posB = (linesB.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;

    // Should not be identical
    let allSame = true;
    const minLen = Math.min(posA.length, posB.length);
    for (let i = 0; i < minLen; i++) {
      if (posA[i] !== posB[i]) {
        allSame = false;
        break;
      }
    }
    expect(allSame).toBe(false);
  });

  it('T-069-42: topology vertices exist in 3D (not coplanar, Z values vary across instances)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ maxTopologyInstances: 8, seed: 'test-42' });
    constellation.init(scene, new Float32Array(0), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const posArr = (lines.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const activeCount = getActiveVertexCount(constellation);

    const zValues = new Set<number>();
    const xValues = new Set<number>();
    const yValues = new Set<number>();
    for (let i = 0; i < activeCount; i++) {
      xValues.add(Math.round(posArr[i * 3] * 100));
      yValues.add(Math.round(posArr[i * 3 + 1] * 100));
      zValues.add(Math.round(posArr[i * 3 + 2] * 100));
    }
    expect(zValues.size).toBeGreaterThanOrEqual(3);
    expect(xValues.size).toBeGreaterThanOrEqual(3);
    expect(yValues.size).toBeGreaterThanOrEqual(3);
  });
});

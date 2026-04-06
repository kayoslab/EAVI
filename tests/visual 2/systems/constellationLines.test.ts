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

describe('US-055: Add constellation connection lines between points', () => {
  it('T-055-01: init() adds a THREE.LineSegments mesh to the scene', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    const positions = generateMockPositions(100);
    constellation.init(scene, positions, defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(1);
  });

  it('T-055-02: LineSegments mesh uses BufferGeometry with position attribute (itemSize 3)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(100), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
  });

  it('T-055-03: only points within proximity threshold are connected (default threshold)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ proximityThreshold: 1.0 });
    // Place two points close together and one far away
    const positions = new Float32Array([
      0, 0, 0,
      0.5, 0, 0,
      10, 10, 10,
    ]);
    constellation.init(scene, positions, defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    // Should have exactly 1 line segment (2 vertices) connecting the two close points
    const vertexCount = getActiveVertexCount(constellation);
    expect(vertexCount).toBe(2);
  });

  it('T-055-04: configurable proximity threshold changes which points are connected', () => {
    const scene = new THREE.Scene();
    const positions = new Float32Array([
      0, 0, 0,
      0.5, 0, 0,
      1.5, 0, 0,
    ]);
    const narrow = createConstellationLines({ proximityThreshold: 0.6 });
    narrow.init(scene, positions, defaultParams);
    const narrowCount = getActiveVertexCount(narrow);

    const wide = createConstellationLines({ proximityThreshold: 2.0 });
    wide.init(scene, positions, defaultParams);
    const wideCount = getActiveVertexCount(wide);

    expect(wideCount).toBeGreaterThan(narrowCount);
  });

  it('T-055-05: bass energy modulates connection distance threshold via uniform', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
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

  it('T-055-06: line opacity fades with distance between connected points (distance attribute present)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ proximityThreshold: 5.0 });
    // Two pairs at different distances
    const positions = new Float32Array([
      0, 0, 0,
      0.2, 0, 0,
      3, 0, 0,
      3.8, 0, 0,
    ]);
    constellation.init(scene, positions, defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    // Expect a distance-based attribute (aDistance or similar) for opacity fading
    const distAttr = geo.getAttribute('aDistance');
    expect(distAttr).toBeDefined();
    expect(distAttr.itemSize).toBe(1);
  });

  it('T-055-07: closer connections have higher alpha factor than distant connections', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ proximityThreshold: 5.0 });
    const positions = new Float32Array([
      0, 0, 0,
      0.1, 0, 0,
      4, 0, 0,
      4.9, 0, 0,
    ]);
    constellation.init(scene, positions, defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const geo = lines.geometry as THREE.BufferGeometry;
    const distArr = geo.getAttribute('aDistance').array as Float32Array;
    // First pair distance ~0.1, second pair distance ~0.9
    // Lower distance value means closer connection (higher opacity in shader)
    const activeCount = getActiveVertexCount(constellation);
    if (activeCount >= 4) {
      const dist1 = distArr[0];
      const dist2 = distArr[2];
      expect(dist1).toBeLessThan(dist2);
    }
  });

  it('T-055-08: connection count is bounded by maxConnections config', () => {
    const scene = new THREE.Scene();
    const maxConnections = 10;
    const constellation = createConstellationLines({ maxConnections, proximityThreshold: 100.0 });
    // Many densely packed points that would produce many connections
    constellation.init(scene, generateMockPositions(200), defaultParams);
    const activeCount = getActiveVertexCount(constellation);
    // Each connection is 2 vertices in LineSegments
    expect(activeCount / 2).toBeLessThanOrEqual(maxConnections);
  });

  it('T-055-09: default maxConnections prevents runaway line count with dense point clouds', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ proximityThreshold: 100.0 });
    constellation.init(scene, generateMockPositions(500), defaultParams);
    const activeCount = getActiveVertexCount(constellation);
    // Should be bounded to some reasonable default (not 500*499/2 = 124750 connections)
    expect(activeCount).toBeLessThan(10000);
  });

  it('T-055-10: LineSegments uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-055-11: material uses transparent blending and depthWrite disabled for compositing over points', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-055-12: shader includes fog uniform for depth fog effect', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    // Should have fog-related uniform or Three.js fog integration
    expect(mat.fog || mat.uniforms.uFogDensity || mat.uniforms.uFogNear !== undefined).toBeTruthy();
  });

  it('T-055-13: low tier config reduces maxConnections or disables constellation entirely', () => {
    const scene = new THREE.Scene();
    const lowTier = createConstellationLines({ maxConnections: 50 });
    lowTier.init(scene, generateMockPositions(200), defaultParams);
    const lowCount = getActiveVertexCount(lowTier);

    const highTier = createConstellationLines({ maxConnections: 500 });
    highTier.init(scene, generateMockPositions(200), defaultParams);
    const highCount = getActiveVertexCount(highTier);

    expect(lowCount).toBeLessThanOrEqual(highCount);
  });

  it('T-055-14: init with null positions does not throw (graceful skip for incompatible systems)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    expect(() => constellation.init(scene, null as unknown as Float32Array, defaultParams)).not.toThrow();
    // Should not add any mesh to scene when no positions provided
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(0);
  });

  it('T-055-15: init with empty positions array does not throw', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    expect(() => constellation.init(scene, new Float32Array(0), defaultParams)).not.toThrow();
  });

  it('T-055-16: init with fewer than 2 points produces no connections', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    const singlePoint = new Float32Array([1, 2, 3]);
    constellation.init(scene, singlePoint, defaultParams);
    const linesMeshes = scene.children.filter((c) => c instanceof THREE.LineSegments);
    expect(linesMeshes.length).toBe(0);
  });

  it('T-055-17: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    expect(() => constellation.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-055-18: draw() updates uTime uniform from frame state', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ time: 4200, elapsed: 4200 }));
    expect(mat.uniforms.uTime.value).toBe(4200);
  });

  it('T-055-19: cleanup() removes LineSegments from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
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
    const constellation = createConstellationLines();
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
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.8 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.8);
  });

  it('T-055-22: palette hue uniform reflects visual params', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), { ...defaultParams, paletteHue: 90 });
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-055-23: same positions produce same connection topology (deterministic)', () => {
    const scene = new THREE.Scene();
    const positions = generateMockPositions(80);
    const a = createConstellationLines();
    a.init(scene, positions, defaultParams);
    const countA = getActiveVertexCount(a);

    const b = createConstellationLines();
    b.init(scene, positions, defaultParams);
    const countB = getActiveVertexCount(b);

    expect(countA).toBe(countB);
  });

  it('T-055-24: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const params = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    expect(() => constellation.draw(scene, makeFrame({ params, pointerX: undefined, pointerY: undefined }))).not.toThrow();
  });

  it('T-055-25: boundary values (proximityThreshold=0, maxConnections=0) do not throw', () => {
    const scene = new THREE.Scene();
    const positions = generateMockPositions(50);
    const zeroThreshold = createConstellationLines({ proximityThreshold: 0 });
    expect(() => zeroThreshold.init(scene, positions, defaultParams)).not.toThrow();

    const zeroMax = createConstellationLines({ maxConnections: 0 });
    expect(() => zeroMax.init(scene, positions, defaultParams)).not.toThrow();
  });

  it('T-055-26: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    constellation.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-055-27: line positions exist in 3D space (not coplanar, Z values vary)', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
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
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-055-29: motion amplitude uniform is updated from visual params', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines();
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    constellation.draw(scene, makeFrame({ params: { ...defaultParams, motionAmplitude: 0.2 } }));
    expect(mat.uniforms.uMotionAmplitude.value).toBe(0.2);
  });

  it('T-055-30: proximity threshold uniform exists for bass-driven modulation in shader', () => {
    const scene = new THREE.Scene();
    const constellation = createConstellationLines({ proximityThreshold: 1.5 });
    constellation.init(scene, generateMockPositions(50), defaultParams);
    const lines = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lines.material as THREE.ShaderMaterial;
    expect(mat.uniforms.uProximityThreshold).toBeDefined();
    expect(mat.uniforms.uProximityThreshold.value).toBeCloseTo(1.5, 2);
  });
});

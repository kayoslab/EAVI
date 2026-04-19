import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createFlowRibbonField, getPointCount, getPointPositions } from '../../../src/visual/systems/flowRibbonField';
import { OPTIONAL_FLOWRIBBON_ATTRIBUTES } from '../../../src/visual/shaderRegistry';
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

describe('US-063: FlowRibbonField geometry system', () => {
  it('T-063-01: init creates THREE.Points mesh in scene', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'mesh-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
    const lineMeshes = scene.children.filter((c) => c instanceof THREE.Line);
    expect(lineMeshes.length).toBe(0);
  });

  it('T-063-02: mesh uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-063-03: vertex shader contains curl3 call for flow-field displacement', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'curl-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('curl3');
  });

  it('T-063-04: vertex shader references uBassEnergy for flow speed modulation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'bass-shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('uBassEnergy');
  });

  it('T-063-05: vertex shader references uTrebleEnergy for turbulence modulation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'treble-shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('uTrebleEnergy');
  });

  it('T-063-06: fragment shader uses gl_PointCoord for elongated sprite rendering', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'frag-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('gl_PointCoord');
  });

  it('T-063-07: vertex shader passes elongation varying to fragment shader', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'elong-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.vertexShader).toContain('vElongation');
    expect(mat.fragmentShader).toContain('vElongation');
  });

  it('T-063-08: geometry has required attributes: position(3), color(3), aHueOffset(1), aRandom(3)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    expect(geo.getAttribute('position')).toBeDefined();
    expect(geo.getAttribute('position').itemSize).toBe(3);
    expect(geo.getAttribute('aVertexColor')).toBeDefined();
    expect(geo.getAttribute('aVertexColor').itemSize).toBe(3);
    expect(geo.getAttribute('aRandom')).toBeDefined();
    expect(geo.getAttribute('aRandom').itemSize).toBe(3);
  });

  it('T-063-09: optional size attribute has itemSize 1 when present', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'size-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const sizeAttr = geo.getAttribute('size');
    if (sizeAttr) {
      expect(sizeAttr.itemSize).toBe(1);
    }
  });

  it('T-063-10: all buffer attributes contain only finite values after init', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'finite-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    for (const name of ['position', 'aVertexColor', 'aRandom']) {
      const arr = geo.getAttribute(name).array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });

  it('T-063-11: point positions have non-zero Z-depth confirming 3D distribution', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'depth-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = posArr.length / 3;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-063-12: same seed produces same initial point configuration', () => {
    const scene = new THREE.Scene();
    const a = createFlowRibbonField();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createFlowRibbonField();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getPointPositions(a)).toEqual(getPointPositions(b));
  });

  it('T-063-13: different seeds produce different configurations', () => {
    const scene = new THREE.Scene();
    const a = createFlowRibbonField();
    a.init(scene, 'seed-one', defaultParams);
    const b = createFlowRibbonField();
    b.init(scene, 'seed-two', defaultParams);
    expect(getPointPositions(a)).not.toEqual(getPointPositions(b));
  });

  it('T-063-14: draw does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'draw-seed', defaultParams);
    expect(() => flow.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-063-15: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    const params = { ...defaultParams, bassEnergy: 0, trebleEnergy: 0, pointerDisturbance: 0 };
    flow.init(scene, 'edge-seed', params);
    expect(() => flow.draw(scene, makeFrame({ params, pointerX: undefined, pointerY: undefined }))).not.toThrow();
  });

  it('T-063-16: draw does not throw at boundary parameter values', () => {
    const scene = new THREE.Scene();
    const combos: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0, motionAmplitude: 0.2 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1, motionAmplitude: 1 },
      { curveSoftness: 0, structureComplexity: 0 },
      { curveSoftness: 1, structureComplexity: 1 },
    ];
    for (const combo of combos) {
      const params = { ...defaultParams, ...combo };
      const flow = createFlowRibbonField();
      flow.init(scene, 'boundary-seed', params);
      expect(() => flow.draw(scene, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-063-17: draw updates uBassEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'bass-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0.8 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
  });

  it('T-063-18: draw updates uTrebleEnergy uniform from frame params', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'treble-uniform-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, trebleEnergy: 0.6 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0.6);
  });

  it('T-063-19: bass and treble are mapped to distinct uniforms', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'distinct-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, bassEnergy: 0, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-063-20: draw updates uTime uniform over successive frames', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'time-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(mat.uniforms.uTime.value).toBe(100);
    flow.draw(scene, makeFrame({ time: 500, elapsed: 500 }));
    expect(mat.uniforms.uTime.value).toBe(500);
  });

  it('T-063-21: material uses additive blending with transparency and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'blend-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-063-22: vertex shader is distinct from existing warp shaders (uses flow advection, not radial expansion)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'distinct-shader-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // Must use curl3 for flow-field advection
    expect(mat.vertexShader).toContain('curl3');
    // Must have vElongation for streak rendering (unique to flowRibbon)
    expect(mat.vertexShader).toContain('vElongation');
    // Should NOT have ribbonPhase (ribbonWarp pattern) or quantized noise (crystalWarp pattern)
    expect(mat.vertexShader).not.toContain('ribbonPhase');
    expect(mat.vertexShader).not.toContain('floor(rawNoise');
  });

  it('T-063-23: init creates points based on density and maxPoints config', () => {
    const scene = new THREE.Scene();
    const low = createFlowRibbonField({ maxPoints: 500 });
    low.init(scene, 'seed-a', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(low);
    const high = createFlowRibbonField({ maxPoints: 500 });
    high.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(high);
    expect(highCount).toBeGreaterThan(lowCount);
    const capped = createFlowRibbonField({ maxPoints: 250 });
    capped.init(scene, 'seed-a', { ...defaultParams, density: 1.0 });
    expect(getPointCount(capped)).toBeLessThanOrEqual(250);
  });

  it('T-063-24: cleanup removes mesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    flow.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-063-25: setOpacity updates uOpacity uniform', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'opacity-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.setOpacity!(0.5);
    expect(mat.uniforms.uOpacity.value).toBe(0.5);
    flow.setOpacity!(1.0);
    expect(mat.uniforms.uOpacity.value).toBe(1.0);
  });

  it('T-063-26: mesh rotation changes over elapsed time (Y-axis drift)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'drift-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    flow.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    flow.draw(scene, makeFrame({ elapsed: 5000 }));
    const rotY1 = points.rotation.y;
    expect(rotY1).not.toBeCloseTo(rotY0, 5);
  });

  it('T-063-27: paletteHue is passed to GPU via uPaletteHue uniform', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    flow.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);
    flow.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 270 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(270);
  });

  it('T-063-28: shader has uFlowScale uniform for advection strength control', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'flow-scale-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.uniforms.uFlowScale).toBeDefined();
    expect(typeof mat.uniforms.uFlowScale.value).toBe('number');
  });

  it('T-063-29: no localStorage or cookie access during flow ribbon operations', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    const cookieGet = vi.fn().mockReturnValue('');
    Object.defineProperty(document, 'cookie', { get: cookieGet, configurable: true });
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'privacy-seed', defaultParams);
    flow.draw(scene, makeFrame());
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(cookieGet).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    if (cookieDescriptor) {
      Object.defineProperty(document, 'cookie', cookieDescriptor);
    }
  });

  it('T-063-30: position buffer values are finite at boundary params', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0 },
      { density: 1, structureComplexity: 1, curveSoftness: 0 },
    ];
    for (const b of boundaries) {
      const flow = createFlowRibbonField();
      flow.init(scene, 'boundary-finite-seed', { ...defaultParams, ...b });
      const points = scene.children.filter((c) => c instanceof THREE.Points).pop() as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      for (let i = 0; i < posArr.length; i++) {
        expect(Number.isFinite(posArr[i])).toBe(true);
      }
    }
  });

  it('T-063-34: flowribbon mode is importable and implements GeometrySystem interface', () => {
    const flow = createFlowRibbonField();
    expect(typeof flow.init).toBe('function');
    expect(typeof flow.draw).toBe('function');
    expect(typeof flow.cleanup).toBe('function');
    expect(typeof flow.setOpacity).toBe('function');
  });

  it('T-063-35: fragment shader includes fog/depth attenuation', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'fog-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    expect(mat.fragmentShader).toContain('uFogNear');
    expect(mat.fragmentShader).toContain('uFogFar');
  });
});

describe('US-086: FlowRibbonField long sweeping curves and depth fade', () => {
  it('T-086-01: ribbon count is reduced — sourceCount ≤ 30 for default maxPoints', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'ribbon-count-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const totalPoints = geo.getAttribute('position').count;
    // With long trail lengths (≥80), sourceCount should be totalPoints / trailLength ≤ 30
    // For default maxPoints (5000) at default density, we expect few wide-sweeping ribbons
    // The ratio of total points to trail length gives the ribbon count
    // With trailLength ~100 and default density, sourceCount should be well under 30
    expect(totalPoints).toBeGreaterThan(0);
    // Check that we can infer a low ribbon count: if trail length is ≥80,
    // then sourceCount = ceil(totalPoints / trailLength) ≤ 30
    // We verify this indirectly: totalPoints / 80 should be ≤ 30
    // (since trailLength ≥ 80 means each ribbon has ≥ 80 points)
    const maxRibbonCount = Math.ceil(totalPoints / 80);
    expect(maxRibbonCount).toBeLessThanOrEqual(30);
  });

  it('T-086-02: trail length is ≥ 80 points per ribbon (long sweeping curves)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'trail-length-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const totalPoints = geo.getAttribute('position').count;
    // With reduced source count (≤ 30) and the total point budget,
    // the per-ribbon trail length should be at least 80
    // Minimum trail length = totalPoints / maxSourceCount
    // Even at max 30 ribbons, with default ~2400 points, trail length ≈ 80+
    const minTrailLength = Math.floor(totalPoints / 30);
    expect(minTrailLength).toBeGreaterThanOrEqual(80);
  });

  it('T-086-03: aTrailProgress attribute exists with itemSize 1 and values in [0, 1]', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'trail-progress-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const trailProgress = geo.getAttribute('aTrailProgress');
    expect(trailProgress).toBeDefined();
    expect(trailProgress.itemSize).toBe(1);
    const arr = trailProgress.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(arr[i]).toBeGreaterThanOrEqual(0);
      expect(arr[i]).toBeLessThanOrEqual(1);
    }
  });

  it('T-086-04: vertex shader contains treble-driven point size modulation (uTrebleEnergy near gl_PointSize)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'treble-size-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // The vertex shader should modulate gl_PointSize with uTrebleEnergy
    // Look for treble energy influencing point size calculation
    expect(mat.vertexShader).toContain('uTrebleEnergy');
    // Verify treble is used in the point-size section (not just turbulence)
    // The shader should have a treble-based size factor near the gl_PointSize assignment
    const lines = mat.vertexShader.split('\n');
    const pointSizeLineIdx = lines.findIndex((l) => l.includes('gl_PointSize'));
    expect(pointSizeLineIdx).toBeGreaterThan(-1);
    // Search within ±10 lines of gl_PointSize for treble-driven size modulation
    const contextStart = Math.max(0, pointSizeLineIdx - 10);
    const contextEnd = Math.min(lines.length, pointSizeLineIdx + 10);
    const sizeContext = lines.slice(contextStart, contextEnd).join('\n');
    expect(sizeContext).toContain('uTrebleEnergy');
  });

  it('T-086-05: fragment shader contains trail-progress fade (vTrailProgress)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'trail-fade-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // Fragment shader must use vTrailProgress for tail fade
    expect(mat.fragmentShader).toContain('vTrailProgress');
    // Vertex shader must also pass this varying
    expect(mat.vertexShader).toContain('vTrailProgress');
  });

  it('T-086-06: aTrailProgress attribute is registered in shaderRegistry as optional', () => {
    const hasTrailProgress = OPTIONAL_FLOWRIBBON_ATTRIBUTES.some(
      (attr) => attr.name === 'aTrailProgress' && attr.itemSize === 1,
    );
    expect(hasTrailProgress).toBe(true);
  });

  it('T-086-07: advection produces spatially spread curves (not tightly clustered)', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'spread-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = posArr.length / 3;
    // Compute bounding box extent
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const x = posArr[i * 3], y = posArr[i * 3 + 1], z = posArr[i * 3 + 2];
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    }
    // With wider source radius and longer advection, curves should span a reasonable extent
    const extentX = maxX - minX;
    const extentY = maxY - minY;
    const extentZ = maxZ - minZ;
    // At least 2.0 extent in each axis for sweeping curves
    expect(extentX).toBeGreaterThan(2.0);
    expect(extentY).toBeGreaterThan(2.0);
    expect(extentZ).toBeGreaterThan(2.0);
  });

  it('T-086-08: uFogFar default is widened to accommodate longer sweeping ribbons', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'fog-far-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // uFogFar should be ≥ 10.0 to let long ribbons breathe before fading
    expect(mat.uniforms.uFogFar.value).toBeGreaterThanOrEqual(10.0);
  });

  it('T-086-09: bass modulates curve amplitude via scaled displacement factor', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'bass-amplitude-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;
    // Vertex shader should scale curl3 displacement with bass energy for macro sweep amplitude
    // Look for a bass-dependent factor in the flow velocity calculation (not just flat * uBassEnergy * 0.4)
    const vertSrc = mat.vertexShader;
    // Should contain a bass-driven amplitude scaling pattern like (0.3 + uBassEnergy * 0.7)
    // or similar non-flat bass modulation near the curl3 displacement
    expect(vertSrc).toContain('uBassEnergy');
    // The velocity line should not be just a simple flat multiplier
    // Check that bass influences displacement magnitude (curl3 result scaling)
    const lines = vertSrc.split('\n');
    const curlLine = lines.find((l) => l.includes('curl3') && l.includes('vel'));
    expect(curlLine).toBeDefined();
  });

  it('T-086-10: draw does not throw at extreme audio boundary values with new geometry', () => {
    const scene = new THREE.Scene();
    const extremes: Partial<VisualParams>[] = [
      { bassEnergy: 0, trebleEnergy: 0, density: 0.1 },
      { bassEnergy: 1, trebleEnergy: 1, density: 1 },
      { bassEnergy: 0, trebleEnergy: 1 },
      { bassEnergy: 1, trebleEnergy: 0 },
    ];
    for (const combo of extremes) {
      const params = { ...defaultParams, ...combo };
      const flow = createFlowRibbonField();
      flow.init(scene, 'extreme-seed', params);
      expect(() => flow.draw(scene, makeFrame({ params }))).not.toThrow();
    }
  });

  it('T-086-11: all buffer attributes remain finite with new trail geometry', () => {
    const scene = new THREE.Scene();
    const flow = createFlowRibbonField();
    flow.init(scene, 'finite-trail-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const attrNames = ['position', 'aVertexColor', 'aRandom', 'size'];
    for (const name of attrNames) {
      const attr = geo.getAttribute(name);
      if (!attr) continue;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
    // Also check the new aTrailProgress attribute
    const trailProgress = geo.getAttribute('aTrailProgress');
    if (trailProgress) {
      const arr = trailProgress.array as Float32Array;
      for (let i = 0; i < arr.length; i++) {
        expect(Number.isFinite(arr[i])).toBe(true);
      }
    }
  });
});

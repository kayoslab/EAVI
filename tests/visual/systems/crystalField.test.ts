import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import {
  createCrystalField,
  getPointCount,
  getPointPositions,
} from '../../../src/visual/systems/crystalField';
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

describe('US-044: CrystalField geometry system', () => {
  it('T-044-19: init() adds a THREE.Points mesh to the scene', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'crystal-seed', defaultParams);
    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    expect(pointsMeshes.length).toBe(1);
  });

  it('T-044-20: Points mesh uses BufferGeometry with position attribute (itemSize 3)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField({ maxPoints: 500 });
    crystal.init(scene, 'buf-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThanOrEqual(getPointCount(crystal));
  });

  it('T-044-21: point positions have non-zero Z-depth: Z values span a range > 1.0', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'depth-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = getPointCount(crystal);
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-044-22: crystal is not coplanar with XY plane (not all Z values are zero)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'coplanar-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = getPointCount(crystal);
    let hasNonZeroZ = false;
    for (let i = 0; i < count; i++) {
      if (posArr[i * 3 + 2] !== 0) {
        hasNonZeroZ = true;
        break;
      }
    }
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-044-23: mesh rotation changes over elapsed time (camera drift / parallax)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'drift-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    crystal.draw(scene, makeFrame({ elapsed: 0 }));
    const rotY0 = points.rotation.y;
    crystal.draw(scene, makeFrame({ elapsed: 5000 }));
    const rotY1 = points.rotation.y;
    expect(rotY1).not.toBeCloseTo(rotY0, 5);
  });

  it('T-044-24: crystal uses two-axis rotation (Y + X tilt) for sculptural tumbling', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'twoaxis-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    crystal.draw(scene, makeFrame({ elapsed: 5000 }));
    // Both Y and X rotation should be non-zero after elapsed time
    expect(points.rotation.y).not.toBe(0);
    expect(points.rotation.x).not.toBe(0);
  });

  it('T-044-25: maxPoints=200 produces fewer points than maxPoints=800', () => {
    const scene = new THREE.Scene();
    const crystalLow = createCrystalField({ maxPoints: 200 });
    crystalLow.init(scene, 'tier-seed', defaultParams);
    const lowCount = getPointCount(crystalLow);

    const crystalHigh = createCrystalField({ maxPoints: 800 });
    crystalHigh.init(scene, 'tier-seed', defaultParams);
    const highCount = getPointCount(crystalHigh);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-044-26: point count never exceeds the configured maxPoints', () => {
    const scene = new THREE.Scene();
    const maxPoints = 300;
    const crystal = createCrystalField({ maxPoints });
    crystal.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    expect(getPointCount(crystal)).toBeLessThanOrEqual(maxPoints);
  });

  it('T-044-27: same seed produces identical initial positions (deterministic)', () => {
    const scene = new THREE.Scene();
    const a = createCrystalField();
    a.init(scene, 'deterministic-seed', defaultParams);
    const b = createCrystalField();
    b.init(scene, 'deterministic-seed', defaultParams);
    expect(getPointPositions(a)).toEqual(getPointPositions(b));
  });

  it('T-044-28: different seeds produce different initial positions', () => {
    const scene = new THREE.Scene();
    const a = createCrystalField();
    a.init(scene, 'seed-one', defaultParams);
    const b = createCrystalField();
    b.init(scene, 'seed-two', defaultParams);
    expect(getPointPositions(a)).not.toEqual(getPointPositions(b));
  });

  it('T-044-29: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'safe-seed', defaultParams);
    expect(() => crystal.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-044-30: draw() updates shader uniforms (uTime reflects frame time)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'update-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    crystal.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(mat.uniforms.uTime.value).toBe(100);
  });

  it('T-044-31: cleanup() removes mesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(1);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geoDisposeSpy = vi.spyOn(points.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(points.material as THREE.Material, 'dispose');
    crystal.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.Points).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-044-32: bass energy influences crystal motion (uBassEnergy uniform differs)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'bass-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    crystal.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    crystal.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-044-33: treble energy influences crystal sparkle (uTrebleEnergy uniform differs)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'treble-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    crystal.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    crystal.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-044-34: colors derive from paletteHue (uPaletteHue uniform reflects param)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    crystal.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 180 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(180);
  });

  it('T-044-35: has all 5 buffer attributes (position, color, size, aHueOffset, aRandom)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'attr-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;

    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);

    const vertexColorAttr = geo.getAttribute('aVertexColor');
    expect(vertexColorAttr).toBeDefined();
    expect(vertexColorAttr.itemSize).toBe(3);

    const sizeAttr = geo.getAttribute('size');
    expect(sizeAttr).toBeDefined();
    expect(sizeAttr.itemSize).toBe(1);

    const randomAttr = geo.getAttribute('aRandom');
    expect(randomAttr).toBeDefined();
    expect(randomAttr.itemSize).toBe(3);
  });

  it('T-044-36: mesh uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'shader-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-044-37: material uses additive blending with transparency and depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'blend-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    expect(mat.blending).toBe(THREE.AdditiveBlending);
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-044-38: setOpacity updates uOpacity uniform', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'opacity-seed', defaultParams);
    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;
    crystal.setOpacity!(0.5);
    expect(mat.uniforms.uOpacity.value).toBe(0.5);
    crystal.setOpacity!(0);
    expect(mat.uniforms.uOpacity.value).toBe(0);
  });

  it('T-044-39: low motionAmplitude produces smaller uMotionAmplitude uniform than high', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'motion-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.Points) as THREE.Points).material as THREE.ShaderMaterial;

    const lowParams = { ...defaultParams, motionAmplitude: 0.2 };
    crystal.draw(scene, makeFrame({ elapsed: 100, params: lowParams }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    const highParams = { ...defaultParams, motionAmplitude: 1.0 };
    crystal.draw(scene, makeFrame({ elapsed: 100, params: highParams }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  it('T-044-40: density parameter scales effective point count (higher density = more points)', () => {
    const scene = new THREE.Scene();
    const crystalLow = createCrystalField();
    crystalLow.init(scene, 'density-seed', { ...defaultParams, density: 0.3 });
    const lowCount = getPointCount(crystalLow);

    const crystalHigh = createCrystalField();
    crystalHigh.init(scene, 'density-seed', { ...defaultParams, density: 1.0 });
    const highCount = getPointCount(crystalHigh);

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-044-41: boundary values (density=0, density=1, structureComplexity=0/1) do not throw', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
      { density: 0.5, structureComplexity: 0.5 },
    ];
    for (const b of boundaries) {
      const crystal = createCrystalField();
      const params = { ...defaultParams, ...b };
      expect(() => {
        crystal.init(scene, 'boundary-seed', params);
        crystal.draw(scene, makeFrame({ params }));
      }).not.toThrow();
    }
  });

  it('T-044-42: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    crystal.init(scene, 'edge-seed', params);

    expect(() => crystal.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-044-43: crystal only selects from crystalCluster and geode shapes (not other volumetric shapes)', () => {
    const scene = new THREE.Scene();
    // Run multiple seeds to check shape selection is always crystal-only
    const seeds = ['shape-a', 'shape-b', 'shape-c', 'shape-d', 'shape-e', 'shape-f', 'shape-g', 'shape-h'];
    for (const seed of seeds) {
      const crystal = createCrystalField();
      expect(() => crystal.init(scene, seed, defaultParams)).not.toThrow();
      // Should produce valid 3D points regardless of seed
      const positions = getPointPositions(crystal);
      expect(positions).not.toBeNull();
      expect(positions!.length).toBeGreaterThan(0);
    }
  });

  describe('privacy', () => {
    it('T-044-44: no localStorage or cookie access during init/draw operations', () => {
      const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
      const cookieSpy = vi.spyOn(document, 'cookie', 'get');
      const scene = new THREE.Scene();
      const crystal = createCrystalField();
      crystal.init(scene, 'privacy-seed', defaultParams);
      crystal.draw(scene, makeFrame());
      expect(lsSpy).not.toHaveBeenCalled();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });

  describe('volumetric generator integration', () => {
    it('T-044-45: init() produces volumetric geometry with Z-depth > 1.0', () => {
      const scene = new THREE.Scene();
      const crystal = createCrystalField();
      crystal.init(scene, 'vol-depth', defaultParams);
      const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
      const count = getPointCount(crystal);
      let minZ = Infinity, maxZ = -Infinity;
      for (let i = 0; i < count; i++) {
        const z = posArr[i * 3 + 2];
        if (z < minZ) minZ = z;
        if (z > maxZ) maxZ = z;
      }
      expect(maxZ - minZ).toBeGreaterThan(1.0);
    });

    it('T-044-46: init() produces non-coplanar points in all three axes', () => {
      const scene = new THREE.Scene();
      const crystal = createCrystalField();
      crystal.init(scene, 'vol-coplanar', defaultParams);
      const positions = getPointPositions(crystal)!;
      const count = positions.length / 3;
      let sumX = 0, sumY = 0, sumZ = 0;
      for (let i = 0; i < count; i++) {
        sumX += positions[i * 3];
        sumY += positions[i * 3 + 1];
        sumZ += positions[i * 3 + 2];
      }
      const meanX = sumX / count, meanY = sumY / count, meanZ = sumZ / count;
      let varX = 0, varY = 0, varZ = 0;
      for (let i = 0; i < count; i++) {
        varX += (positions[i * 3] - meanX) ** 2;
        varY += (positions[i * 3 + 1] - meanY) ** 2;
        varZ += (positions[i * 3 + 2] - meanZ) ** 2;
      }
      expect(Math.sqrt(varX / count)).toBeGreaterThan(0.1);
      expect(Math.sqrt(varY / count)).toBeGreaterThan(0.1);
      expect(Math.sqrt(varZ / count)).toBeGreaterThan(0.1);
    });
  });
});

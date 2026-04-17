import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createModeManager } from '../../../src/visual/modeManager';
import { createCrystalField } from '../../../src/visual/systems/crystalField';
import { createPointCloud } from '../../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../../src/visual/systems/ribbonField';
import { createParticleField } from '../../../src/visual/systems/particleField';
import { validateGeometryAttributes } from '../../../src/visual/geometryValidator';
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
    elapsed: 0,
    width: 800,
    height: 600,
    params: { ...defaultParams },
    ...overrides,
  };
}

describe('US-085: Crystal lattice integration with ModeManager', () => {
  it('T-085-56: lattice crystal mode works in ModeManager without throwing', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);

    expect(() => manager.init(scene, 'lattice-int-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-085-57: mode switching with bass/treble preserves audio flow to lattice crystal', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);
    manager.init(scene, 'audio-lattice-seed', defaultParams);

    // Normal draw
    manager.draw(scene, makeFrame({ elapsed: 0 }));

    // Trigger transition with audio data
    expect(() => manager.draw(scene, makeFrame({
      elapsed: 200_000,
      params: { ...defaultParams, bassEnergy: 0.9, trebleEnergy: 0.7 },
    }))).not.toThrow();

    // Mid-transition
    expect(() => manager.draw(scene, makeFrame({
      elapsed: 201_500,
      params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 },
    }))).not.toThrow();

    // Post-transition
    expect(() => manager.draw(scene, makeFrame({
      elapsed: 205_000,
      params: { ...defaultParams, bassEnergy: 0.5, trebleEnergy: 0.3 },
    }))).not.toThrow();
  });

  it('T-085-58: mode transitions to/from crystal are smooth over long lifecycle', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);
    manager.init(scene, 'smooth-lattice-seed', defaultParams);

    for (let t = 0; t <= 210_000; t += 500) {
      expect(() => manager.draw(scene, makeFrame({ elapsed: t }))).not.toThrow();
    }
  });

  it('T-085-59: initAllForValidation initializes lattice crystal for shader validation', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);

    expect(() => manager.initAllForValidation(scene, 'val-lattice-seed', defaultParams)).not.toThrow();
    expect(() => manager.cleanupInactive()).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-085-60: four-mode cycling with lattice crystal — no errors over long elapsed', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);
    manager.init(scene, 'cycle-lattice-seed', defaultParams);

    for (let t = 0; t <= 800_000; t += 5000) {
      expect(() => manager.draw(scene, makeFrame({ elapsed: t }))).not.toThrow();
    }
  });
});

describe('US-085: Crystal lattice geometry validation', () => {
  it('T-085-61: geometry passes validation with all required + new attributes', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'validate-lattice', defaultParams);

    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const geo = points.geometry as THREE.BufferGeometry;

    const result = validateGeometryAttributes(
      geo,
      [
        { name: 'position', itemSize: 3 },
        { name: 'size', itemSize: 1 },
        { name: 'aRandom', itemSize: 3 },
        { name: 'aVertexColor', itemSize: 3 },
      ],
      [
        { name: 'aLatticePos', itemSize: 3 },
        { name: 'aFacetNormal', itemSize: 3 },
      ],
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('T-085-62: lattice crystal uses THREE.Points with ShaderMaterial (not Line/Mesh)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'mesh-type-check', defaultParams);

    const pointsMeshes = scene.children.filter((c) => c instanceof THREE.Points);
    const lineMeshes = scene.children.filter((c) => c instanceof THREE.Line);
    const lineSegments = scene.children.filter((c) => c instanceof THREE.LineSegments);

    expect(pointsMeshes.length).toBe(1);
    expect(lineMeshes.length).toBe(0);
    expect(lineSegments.length).toBe(0);

    const mat = (pointsMeshes[0] as THREE.Points).material;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
  });

  it('T-085-63: position attribute has itemSize 3 and all finite values (true 3D)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, '3d-lattice-check', defaultParams);

    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posAttr = (points.geometry as THREE.BufferGeometry).getAttribute('position');
    expect(posAttr.itemSize).toBe(3);

    const arr = posAttr.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-085-64: Z-depth span of lattice crystal exceeds 1.0 (volumetric)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'depth-lattice', defaultParams);

    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const posArr = (points.geometry as THREE.BufferGeometry).getAttribute('position').array as Float32Array;
    const count = posArr.length / 3;

    let minZ = Infinity, maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = posArr[i * 3 + 2];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });
});

describe('US-085: Crystal no longer uses CRYSTAL_SHAPES / generateVolumetricPoints', () => {
  it('T-085-65: vertex shader references lattice-specific constructs (not just radial expansion)', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'shader-check', defaultParams);

    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    // Should contain lattice pulse logic
    expect(mat.vertexShader).toContain('uLatticePulse');
    // Should contain facet shimmer logic
    expect(mat.vertexShader).toContain('uFacetShimmer');
    expect(mat.vertexShader).toContain('aLatticePos');
    expect(mat.vertexShader).toContain('aFacetNormal');
  });

  it('T-085-66: fragment shader uses facet normal for facing-dependent brightness', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    crystal.init(scene, 'frag-check', defaultParams);

    const points = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = points.material as THREE.ShaderMaterial;

    // Fragment shader should use vFacetNormal for directional lighting
    expect(mat.fragmentShader).toContain('vFacetNormal');
  });
});

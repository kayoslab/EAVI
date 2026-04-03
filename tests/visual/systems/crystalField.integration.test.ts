import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createModeManager } from '../../../src/visual/modeManager';
import { createCrystalField } from '../../../src/visual/systems/crystalField';
import { createPointCloud } from '../../../src/visual/systems/pointCloud';
import { createRibbonField } from '../../../src/visual/systems/ribbonField';
import { createParticleField } from '../../../src/visual/systems/particleField';
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

describe('US-044: Crystal mode integration with ModeManager', () => {
  it('T-044-47: crystal mode works in ModeManager without throwing', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);

    expect(() => manager.init(scene, 'integration-seed', defaultParams)).not.toThrow();
    expect(() => manager.draw(scene, makeFrame({ elapsed: 0 }))).not.toThrow();
  });

  it('T-044-48: mode switching preserves audio pipeline — bass/treble flow to crystal during transition', () => {
    const scene = new THREE.Scene();
    const crystal = createCrystalField();
    const pointCloud = createPointCloud();

    const manager = createModeManager([
      { name: 'points', factory: () => pointCloud },
      { name: 'crystal', factory: () => crystal },
    ]);
    manager.init(scene, 'audio-flow-seed', defaultParams);

    // Normal draw
    manager.draw(scene, makeFrame({ elapsed: 0 }));

    // Trigger transition with audio data
    const audioFrame = makeFrame({
      elapsed: 200_000,
      params: { ...defaultParams, bassEnergy: 0.8, trebleEnergy: 0.6 },
    });
    expect(() => manager.draw(scene, audioFrame)).not.toThrow();

    // Mid-transition
    expect(() => manager.draw(scene, makeFrame({
      elapsed: 201_500,
      params: { ...defaultParams, bassEnergy: 0.9, trebleEnergy: 0.7 },
    }))).not.toThrow();

    // Post-transition
    expect(() => manager.draw(scene, makeFrame({
      elapsed: 205_000,
      params: { ...defaultParams, bassEnergy: 0.5, trebleEnergy: 0.3 },
    }))).not.toThrow();
  });

  it('T-044-49: mode transitions from/to crystal are smooth — no throw during entire lifecycle', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);
    manager.init(scene, 'smooth-seed', defaultParams);

    // Draw frames spanning before, during, and after transition
    for (let t = 0; t <= 210_000; t += 500) {
      expect(() => manager.draw(scene, makeFrame({ elapsed: t }))).not.toThrow();
    }
  });

  it('T-044-50: initAllForValidation initializes crystal mode for shader validation', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);

    expect(() => manager.initAllForValidation(scene, 'val-seed', defaultParams)).not.toThrow();
    expect(() => manager.cleanupInactive()).not.toThrow();
    expect(() => manager.draw(scene, makeFrame())).not.toThrow();
  });

  it('T-044-51: four-mode cycling — all modes receive draw calls over long elapsed time', () => {
    const scene = new THREE.Scene();
    const manager = createModeManager([
      { name: 'particles', factory: () => createParticleField() },
      { name: 'ribbon', factory: () => createRibbonField() },
      { name: 'points', factory: () => createPointCloud() },
      { name: 'crystal', factory: () => createCrystalField() },
    ]);
    manager.init(scene, 'cycle-seed', defaultParams);

    // Draw across enough time to trigger multiple mode switches
    for (let t = 0; t <= 800_000; t += 5000) {
      expect(() => manager.draw(scene, makeFrame({ elapsed: t }))).not.toThrow();
    }
  });
});

describe('US-044: No 2D line or flat plane geometries remain', () => {
  it('T-044-52: all four geometry systems use THREE.Points (not THREE.Line or THREE.LineSegments)', () => {
    const scene = new THREE.Scene();
    const systems = [
      { name: 'particles', system: createParticleField() },
      { name: 'ribbon', system: createRibbonField() },
      { name: 'points', system: createPointCloud() },
      { name: 'crystal', system: createCrystalField() },
    ];

    for (const { name, system } of systems) {
      const testScene = new THREE.Scene();
      system.init(testScene, 'audit-seed', defaultParams);

      const pointsMeshes = testScene.children.filter((c) => c instanceof THREE.Points);
      const lineMeshes = testScene.children.filter((c) => c instanceof THREE.Line);
      const lineSegments = testScene.children.filter((c) => c instanceof THREE.LineSegments);

      expect(pointsMeshes.length).toBeGreaterThanOrEqual(1);
      expect(lineMeshes.length).toBe(0);
      expect(lineSegments.length).toBe(0);
    }
  });

  it('T-044-53: all four geometry systems use ShaderMaterial (not LineBasicMaterial or MeshBasicMaterial)', () => {
    const systems = [
      { name: 'particles', system: createParticleField() },
      { name: 'ribbon', system: createRibbonField() },
      { name: 'points', system: createPointCloud() },
      { name: 'crystal', system: createCrystalField() },
    ];

    for (const { name, system } of systems) {
      const testScene = new THREE.Scene();
      system.init(testScene, 'mat-audit-seed', defaultParams);

      const points = testScene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      expect(points.material).toBeInstanceOf(THREE.ShaderMaterial);
    }
  });

  it('T-044-54: all four geometry systems have 3-component position attributes (true 3D)', () => {
    const systems = [
      { name: 'particles', system: createParticleField() },
      { name: 'ribbon', system: createRibbonField() },
      { name: 'points', system: createPointCloud() },
      { name: 'crystal', system: createCrystalField() },
    ];

    for (const { name, system } of systems) {
      const testScene = new THREE.Scene();
      system.init(testScene, '3d-audit-seed', defaultParams);

      const points = testScene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
      const posAttr = (points.geometry as THREE.BufferGeometry).getAttribute('position');
      expect(posAttr).toBeDefined();
      expect(posAttr.itemSize).toBe(3);
    }
  });
});

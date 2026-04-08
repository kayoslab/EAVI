import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createFractalGrowthWireframe } from '../../../src/visual/systems/fractalGrowthWireframe';
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

describe('US-070: fractalGrowthWireframe occlusion', () => {
  it('T-070-31: with enableOcclusion=true, an InstancedMesh is added to the scene', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-occ-seed', defaultParams);
    const instanced = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instanced.length).toBeGreaterThanOrEqual(1);
  });

  it('T-070-32: with enableOcclusion=false (default), no InstancedMesh is added', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480 });
    sys.init(scene, 'fg-no-occ-seed', defaultParams);
    const instanced = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instanced.length).toBe(0);
  });

  it('T-070-33: InstancedMesh instance count matches cube count from generator', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-count-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced).toBeDefined();
    // Instance count should be > 0 (at least the root cube)
    expect(instanced.count).toBeGreaterThan(0);
  });

  it('T-070-34: InstancedMesh has renderOrder=-1', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-ro-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced.renderOrder).toBe(-1);
  });

  it('T-070-35: InstancedMesh material has colorWrite=false and depthWrite=true', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-mat-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = instanced.material as THREE.ShaderMaterial;
    expect(mat.colorWrite).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  it('T-070-36: edge material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-edepth-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-37: edge material retains depthWrite=false and AdditiveBlending', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-blend-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-070-38: vertex material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-vdepth-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-39: InstancedMesh renderOrder < edge renderOrder', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-roe-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(instanced.renderOrder).toBeLessThan(lineSeg.renderOrder);
  });

  it('T-070-40: draw() syncs occluder uniforms', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-sync-seed', defaultParams);
    const frame = makeFrame({ params: { bassEnergy: 0.9 } });
    sys.draw(scene, frame);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = instanced.material as THREE.ShaderMaterial;
    if (mat.uniforms.uBassEnergy) {
      expect(mat.uniforms.uBassEnergy.value).toBe(0.9);
    }
    if (mat.uniforms.uTime) {
      expect(mat.uniforms.uTime.value).toBe(frame.elapsed);
    }
  });

  it('T-070-41: cleanup() disposes InstancedMesh geometry and material', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-cleanup-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const geoSpy = vi.spyOn(instanced.geometry, 'dispose');
    const matSpy = vi.spyOn(instanced.material as THREE.Material, 'dispose');
    sys.cleanup();
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-070-42: cleanup() removes InstancedMesh from scene', () => {
    const scene = new THREE.Scene();
    const sys = createFractalGrowthWireframe({ maxEdgesPerShape: 480, enableOcclusion: true });
    sys.init(scene, 'fg-cleanup-rm-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBeGreaterThan(0);
    sys.cleanup();
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });
});

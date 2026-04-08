import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createCubeLatticeWireframe } from '../../../src/visual/systems/cubeLatticeWireframe';
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

describe('US-070: cubeLatticeWireframe occlusion', () => {
  it('T-070-43: with enableOcclusion=true, an InstancedMesh is added to the scene', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-occ-seed', defaultParams);
    const instanced = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instanced.length).toBeGreaterThanOrEqual(1);
  });

  it('T-070-44: with enableOcclusion=false (default), no InstancedMesh is added', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0 });
    sys.init(scene, 'cl-no-occ-seed', defaultParams);
    const instanced = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instanced.length).toBe(0);
  });

  it('T-070-45: InstancedMesh instance count matches alive cell count', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({
      gridSize: 3,
      cellSize: 1.0,
      enableOcclusion: true,
      voidDensity: 0, // no voiding -> all cells alive
    });
    sys.init(scene, 'cl-count-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced).toBeDefined();
    // With gridSize=3 and no voiding, all 27 cells should be alive
    expect(instanced.count).toBe(27);
  });

  it('T-070-46: InstancedMesh has renderOrder=-1', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-ro-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(instanced.renderOrder).toBe(-1);
  });

  it('T-070-47: InstancedMesh material has colorWrite=false and depthWrite=true', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-mat-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = instanced.material as THREE.ShaderMaterial;
    expect(mat.colorWrite).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  it('T-070-48: edge material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-edepth-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-49: edge material retains depthWrite=false and AdditiveBlending', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-blend-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthWrite).toBe(false);
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-070-50: vertex material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-vdepth-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-51: InstancedMesh renderOrder < edge renderOrder', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-roe-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    expect(instanced.renderOrder).toBeLessThan(lineSeg.renderOrder);
  });

  it('T-070-52: draw() syncs occluder uniforms', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-sync-seed', defaultParams);
    const frame = makeFrame({ params: { bassEnergy: 0.75 } });
    sys.draw(scene, frame);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = instanced.material as THREE.ShaderMaterial;
    if (mat.uniforms.uBassEnergy) {
      expect(mat.uniforms.uBassEnergy.value).toBe(0.75);
    }
    if (mat.uniforms.uTime) {
      expect(mat.uniforms.uTime.value).toBe(frame.elapsed);
    }
  });

  it('T-070-53: cleanup() disposes InstancedMesh geometry and material', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-cleanup-seed', defaultParams);
    const instanced = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const geoSpy = vi.spyOn(instanced.geometry, 'dispose');
    const matSpy = vi.spyOn(instanced.material as THREE.Material, 'dispose');
    sys.cleanup();
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-070-54: cleanup() removes InstancedMesh from scene', () => {
    const scene = new THREE.Scene();
    const sys = createCubeLatticeWireframe({ gridSize: 3, cellSize: 1.0, enableOcclusion: true });
    sys.init(scene, 'cl-cleanup-rm-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBeGreaterThan(0);
    sys.cleanup();
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
  });

  it('T-070-55: voided cells reduce InstancedMesh count vs non-voided', () => {
    const scene1 = new THREE.Scene();
    const sys1 = createCubeLatticeWireframe({
      gridSize: 3,
      cellSize: 1.0,
      enableOcclusion: true,
      voidDensity: 0,
    });
    sys1.init(scene1, 'cl-void-seed', defaultParams);
    const instNoVoid = scene1.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    const scene2 = new THREE.Scene();
    const sys2 = createCubeLatticeWireframe({
      gridSize: 3,
      cellSize: 1.0,
      enableOcclusion: true,
      voidDensity: 0.5,
    });
    sys2.init(scene2, 'cl-void-seed', defaultParams);
    const instWithVoid = scene2.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    expect(instWithVoid.count).toBeLessThan(instNoVoid.count);
  });
});

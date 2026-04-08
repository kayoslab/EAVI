import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createWireframePolyhedra } from '../../../src/visual/systems/wireframePolyhedra';
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

describe('US-070: wireframePolyhedra occlusion', () => {
  it('T-070-16: with enableOcclusion=true, occluder Mesh objects are added to scene', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 2, enableOcclusion: true });
    sys.init(scene, 'occ-seed', defaultParams);
    // Scene should contain Mesh objects (occluders) in addition to LineSegments and Points
    const meshes = scene.children.filter(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    );
    expect(meshes.length).toBeGreaterThanOrEqual(2); // one per polyhedron
  });

  it('T-070-17: with enableOcclusion=false (default), no occluder Mesh objects are added', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 2 });
    sys.init(scene, 'no-occ-seed', defaultParams);
    const meshes = scene.children.filter(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    );
    expect(meshes.length).toBe(0);
  });

  it('T-070-18: occluder Mesh position matches paired edge mesh position', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'pos-match-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    expect(occluder).toBeDefined();
    expect(occluder.position.x).toBeCloseTo(lineSeg.position.x, 5);
    expect(occluder.position.y).toBeCloseTo(lineSeg.position.y, 5);
    expect(occluder.position.z).toBeCloseTo(lineSeg.position.z, 5);
  });

  it('T-070-19: occluder Mesh rotation matches paired edge mesh rotation', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'rot-match-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    expect(occluder).toBeDefined();
    expect(occluder.rotation.x).toBeCloseTo(lineSeg.rotation.x, 5);
    expect(occluder.rotation.y).toBeCloseTo(lineSeg.rotation.y, 5);
    expect(occluder.rotation.z).toBeCloseTo(lineSeg.rotation.z, 5);
  });

  it('T-070-20: occluder material has colorWrite=false and depthWrite=true', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'mat-seed', defaultParams);
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    const mat = occluder.material as THREE.ShaderMaterial;
    expect(mat.colorWrite).toBe(false);
    expect(mat.depthWrite).toBe(true);
  });

  it('T-070-21: edge material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'depth-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-22: edge material retains depthWrite=false when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'dw-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.depthWrite).toBe(false);
  });

  it('T-070-23: edge material retains transparent=true and AdditiveBlending', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'blend-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const mat = lineSeg.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.blending).toBe(THREE.AdditiveBlending);
  });

  it('T-070-24: vertex material has depthTest=true when occlusion is enabled', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'vdepth-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const mat = pts.material as THREE.ShaderMaterial;
    expect(mat.depthTest).toBe(true);
  });

  it('T-070-25: occluder renderOrder is less than edge renderOrder', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'ro-seed', defaultParams);
    const lineSeg = scene.children.find((c) => c instanceof THREE.LineSegments) as THREE.LineSegments;
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    expect(occluder.renderOrder).toBeLessThan(lineSeg.renderOrder);
  });

  it('T-070-26: occluder renderOrder is less than vertex renderOrder', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'ro-v-seed', defaultParams);
    const pts = scene.children.find((c) => c instanceof THREE.Points) as THREE.Points;
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    expect(occluder.renderOrder).toBeLessThan(pts.renderOrder);
  });

  it('T-070-27: draw() syncs occluder uniforms from edge material values', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'sync-seed', defaultParams);
    const frame = makeFrame({ params: { bassEnergy: 0.8, trebleEnergy: 0.6 } });
    sys.draw(scene, frame);
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    const mat = occluder.material as THREE.ShaderMaterial;
    // After draw, occluder should have updated time/bass/treble uniforms
    if (mat.uniforms.uTime) {
      expect(mat.uniforms.uTime.value).toBe(frame.elapsed);
    }
    if (mat.uniforms.uBassEnergy) {
      expect(mat.uniforms.uBassEnergy.value).toBe(0.8);
    }
  });

  it('T-070-28: cleanup() disposes occluder geometry and material', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'cleanup-seed', defaultParams);
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    const geoSpy = vi.spyOn(occluder.geometry, 'dispose');
    const matSpy = vi.spyOn(occluder.material as THREE.Material, 'dispose');
    sys.cleanup();
    expect(geoSpy).toHaveBeenCalled();
    expect(matSpy).toHaveBeenCalled();
  });

  it('T-070-29: cleanup() removes occluder from scene', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'cleanup-rm-seed', defaultParams);
    const occluderCountBefore = scene.children.filter(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ).length;
    expect(occluderCountBefore).toBeGreaterThan(0);
    sys.cleanup();
    const occluderCountAfter = scene.children.filter(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ).length;
    expect(occluderCountAfter).toBe(0);
  });

  it('T-070-30: occluder has aRandom attribute for deformation matching', () => {
    const scene = new THREE.Scene();
    const sys = createWireframePolyhedra({ maxPolyhedra: 1, enableOcclusion: true });
    sys.init(scene, 'arandom-seed', defaultParams);
    const occluder = scene.children.find(
      (c) => c instanceof THREE.Mesh && !(c instanceof THREE.InstancedMesh),
    ) as THREE.Mesh;
    const geo = occluder.geometry as THREE.BufferGeometry;
    const aRandom = geo.getAttribute('aRandom');
    expect(aRandom).toBeDefined();
    expect(aRandom.itemSize).toBe(3);
  });
});

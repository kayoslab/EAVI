import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { createMicroGeometry } from '../../../src/visual/systems/microGeometry';
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

describe('US-056: MicroGeometry instanced system', () => {
  it('T-056-01: init() adds a THREE.InstancedMesh to the scene', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'mesh-seed', defaultParams);
    const instanced = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    expect(instanced.length).toBe(1);
  });

  it('T-056-02: InstancedMesh uses a 3D BufferGeometry (not Points)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'geo-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(mesh).toBeDefined();
    expect(mesh).not.toBeInstanceOf(THREE.Points);
    const geo = mesh.geometry as THREE.BufferGeometry;
    const posAttr = geo.getAttribute('position');
    expect(posAttr).toBeDefined();
    expect(posAttr.itemSize).toBe(3);
    expect(posAttr.count).toBeGreaterThan(3);
  });

  it('T-056-03: mesh uses ShaderMaterial with vertex and fragment shaders', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'shader-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
    expect(mat.vertexShader.length).toBeGreaterThan(0);
    expect(mat.fragmentShader.length).toBeGreaterThan(0);
  });

  it('T-056-04: same seed produces same primitive type selection (deterministic)', () => {
    const scene = new THREE.Scene();
    const a = createMicroGeometry();
    a.init(scene, 'deterministic-seed', defaultParams);
    const meshA = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const geoA = meshA.geometry as THREE.BufferGeometry;
    const vertCountA = geoA.getAttribute('position').count;

    const b = createMicroGeometry();
    b.init(scene, 'deterministic-seed', defaultParams);
    const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    const meshB = meshes[meshes.length - 1] as THREE.InstancedMesh;
    const geoB = meshB.geometry as THREE.BufferGeometry;
    const vertCountB = geoB.getAttribute('position').count;

    expect(vertCountA).toBe(vertCountB);
  });

  it('T-056-05: different seeds can produce different primitive types (vertex count differs for at least one pair)', () => {
    const scene = new THREE.Scene();
    const seeds = ['prim-a', 'prim-b', 'prim-c', 'prim-d', 'prim-e', 'prim-f', 'prim-g', 'prim-h', 'prim-i', 'prim-j'];
    const vertCounts = new Set<number>();
    for (const seed of seeds) {
      const micro = createMicroGeometry();
      micro.init(scene, seed, defaultParams);
      const mesh = scene.children.filter((c) => c instanceof THREE.InstancedMesh).pop() as THREE.InstancedMesh;
      vertCounts.add(mesh.geometry.getAttribute('position').count);
      micro.cleanup!();
    }
    expect(vertCounts.size).toBeGreaterThanOrEqual(2);
  });

  it('T-056-06: at least 3 distinct primitive types are possible across seeds', () => {
    const scene = new THREE.Scene();
    const vertCounts = new Set<number>();
    for (let i = 0; i < 50; i++) {
      const micro = createMicroGeometry();
      micro.init(scene, `sweep-${i}`, defaultParams);
      const mesh = scene.children.filter((c) => c instanceof THREE.InstancedMesh).pop() as THREE.InstancedMesh;
      vertCounts.add(mesh.geometry.getAttribute('position').count);
      micro.cleanup!();
    }
    expect(vertCounts.size).toBeGreaterThanOrEqual(3);
  });

  it('T-056-07: InstancedMesh has instanceMatrix attribute with finite values', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'matrix-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(mesh.instanceMatrix).toBeDefined();
    const arr = mesh.instanceMatrix.array as Float32Array;
    expect(arr.length).toBeGreaterThan(0);
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-056-08: instance count matches InstancedMesh.count property', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'count-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(mesh.count).toBeGreaterThanOrEqual(24);
    expect(mesh.instanceMatrix.array.length).toBe(mesh.count * 16);
  });

  it('T-056-09: maxInstances=200 produces fewer instances than maxInstances=1200', () => {
    const scene = new THREE.Scene();
    const microLow = createMicroGeometry({ maxInstances: 200 });
    microLow.init(scene, 'tier-seed', defaultParams);
    const meshLow = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const lowCount = meshLow.count;

    const microHigh = createMicroGeometry({ maxInstances: 1200 });
    microHigh.init(scene, 'tier-seed', defaultParams);
    const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    const meshHigh = meshes[meshes.length - 1] as THREE.InstancedMesh;
    const highCount = meshHigh.count;

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-056-10: instance count never exceeds configured maxInstances', () => {
    const scene = new THREE.Scene();
    const maxInstances = 300;
    const micro = createMicroGeometry({ maxInstances });
    micro.init(scene, 'cap-seed', { ...defaultParams, density: 1.0, structureComplexity: 1.0 });
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(mesh.count).toBeLessThanOrEqual(maxInstances);
  });

  it('T-056-11: density parameter scales effective instance count (higher density = more instances)', () => {
    const scene = new THREE.Scene();
    const microLow = createMicroGeometry({ maxInstances: 600 });
    microLow.init(scene, 'density-seed', { ...defaultParams, density: 0.3 });
    const meshLow = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const lowCount = meshLow.count;

    const microHigh = createMicroGeometry({ maxInstances: 600 });
    microHigh.init(scene, 'density-seed', { ...defaultParams, density: 1.0 });
    const meshes = scene.children.filter((c) => c instanceof THREE.InstancedMesh);
    const meshHigh = meshes[meshes.length - 1] as THREE.InstancedMesh;
    const highCount = meshHigh.count;

    expect(highCount).toBeGreaterThan(lowCount);
  });

  it('T-056-12: draw() does not throw with valid FrameState', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'safe-seed', defaultParams);
    expect(() => micro.draw(scene, makeFrame({ time: 1000, elapsed: 500 }))).not.toThrow();
  });

  it('T-056-13: draw() updates shader uniforms (uTime reflects frame elapsed time)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'update-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    micro.draw(scene, makeFrame({ time: 100, elapsed: 100 }));
    expect(mat.uniforms.uTime.value).toBe(100);
  });

  it('T-056-14: bass energy updates uBassEnergy uniform on draw', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'bass-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh).material as THREE.ShaderMaterial;

    micro.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(0);

    micro.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, bassEnergy: 1.0 } }));
    expect(mat.uniforms.uBassEnergy.value).toBe(1.0);
  });

  it('T-056-15: treble energy updates uTrebleEnergy uniform on draw', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'treble-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh).material as THREE.ShaderMaterial;

    micro.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(0);

    micro.draw(scene, makeFrame({ time: 100, elapsed: 100, params: { ...defaultParams, trebleEnergy: 1.0 } }));
    expect(mat.uniforms.uTrebleEnergy.value).toBe(1.0);
  });

  it('T-056-16: bass drives macro position displacement: instanceMatrix changes with bass energy', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'bass-disp-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    micro.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 0 } }));
    const noBass = new Float32Array(mesh.instanceMatrix.array);

    micro.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, bassEnergy: 1.0 } }));
    const fullBass = new Float32Array(mesh.instanceMatrix.array);

    let diffSum = 0;
    for (let i = 0; i < noBass.length; i++) {
      diffSum += Math.abs(fullBass[i] - noBass[i]);
    }
    expect(diffSum).toBeGreaterThan(0);
  });

  it('T-056-17: treble drives per-instance rotation jitter or scale pulse: instanceMatrix changes with treble energy', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'treble-jitter-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    micro.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, trebleEnergy: 0 } }));
    const noTreble = new Float32Array(mesh.instanceMatrix.array);

    micro.draw(scene, makeFrame({ elapsed: 1000, params: { ...defaultParams, trebleEnergy: 1.0 } }));
    const fullTreble = new Float32Array(mesh.instanceMatrix.array);

    let diffSum = 0;
    for (let i = 0; i < noTreble.length; i++) {
      diffSum += Math.abs(fullTreble[i] - noTreble[i]);
    }
    expect(diffSum).toBeGreaterThan(0);
  });

  it('T-056-18: instanceMatrix.needsUpdate is set to true after draw()', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'needsupdate-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    mesh.instanceMatrix.needsUpdate = false;
    micro.draw(scene, makeFrame({ elapsed: 1000 }));
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
  });

  it('T-056-19: cleanup() removes InstancedMesh from scene and disposes geometry/material', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'cleanup-seed', defaultParams);
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(1);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const geoDisposeSpy = vi.spyOn(mesh.geometry, 'dispose');
    const matDisposeSpy = vi.spyOn(mesh.material as THREE.Material, 'dispose');
    micro.cleanup!();
    expect(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length).toBe(0);
    expect(geoDisposeSpy).toHaveBeenCalled();
    expect(matDisposeSpy).toHaveBeenCalled();
  });

  it('T-056-20: setOpacity updates uOpacity uniform for crossfade', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'opacity-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    micro.setOpacity!(0.5);
    expect(mat.uniforms.uOpacity.value).toBe(0.5);
    micro.setOpacity!(0);
    expect(mat.uniforms.uOpacity.value).toBe(0);
  });

  it('T-056-21: paletteHue uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'hue-seed', { ...defaultParams, paletteHue: 0 });
    const mat = (scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh).material as THREE.ShaderMaterial;

    micro.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 0 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(0);

    micro.draw(scene, makeFrame({ params: { ...defaultParams, paletteHue: 180 } }));
    expect(mat.uniforms.uPaletteHue.value).toBe(180);
  });

  it('T-056-22: motionAmplitude uniform reflects param on draw', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'motion-seed', defaultParams);
    const mat = (scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh).material as THREE.ShaderMaterial;

    micro.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 0.2 } }));
    const lowVal = mat.uniforms.uMotionAmplitude.value;

    micro.draw(scene, makeFrame({ elapsed: 100, params: { ...defaultParams, motionAmplitude: 1.0 } }));
    const highVal = mat.uniforms.uMotionAmplitude.value;

    expect(highVal).toBeGreaterThan(lowVal);
  });

  it('T-056-23: boundary values (density=0, density=1, structureComplexity=0/1) do not throw', () => {
    const scene = new THREE.Scene();
    const boundaries = [
      { density: 0, structureComplexity: 0 },
      { density: 0, structureComplexity: 1 },
      { density: 1, structureComplexity: 0 },
      { density: 1, structureComplexity: 1 },
      { density: 0.5, structureComplexity: 0.5 },
    ];
    for (const b of boundaries) {
      const micro = createMicroGeometry();
      const params = { ...defaultParams, ...b };
      expect(() => {
        micro.init(scene, 'boundary-seed', params);
        micro.draw(scene, makeFrame({ params }));
      }).not.toThrow();
      micro.cleanup!();
    }
  });

  it('T-056-24: draw does not throw with edge-case params (zero bass, zero treble, no pointer)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    const params = {
      ...defaultParams,
      bassEnergy: 0,
      trebleEnergy: 0,
      pointerDisturbance: 0,
    };
    micro.init(scene, 'edge-seed', params);

    expect(() => micro.draw(scene, makeFrame({
      params,
      pointerX: undefined,
      pointerY: undefined,
    }))).not.toThrow();
  });

  it('T-056-25: density=0 still produces at least 24 instances (minimum floor)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'min-seed', { ...defaultParams, density: 0 });
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    expect(mesh.count).toBeGreaterThanOrEqual(24);
  });

  it('T-056-26: instance positions have non-zero Z-depth (3D volume, not flat)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'depth-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const arr = mesh.instanceMatrix.array as Float32Array;
    const count = mesh.count;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < count; i++) {
      const z = arr[i * 16 + 14];
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    expect(maxZ - minZ).toBeGreaterThan(1.0);
  });

  it('T-056-27: instance transforms span all three axes (not coplanar)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'coplanar-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const arr = mesh.instanceMatrix.array as Float32Array;
    const count = mesh.count;
    let hasNonZeroX = false, hasNonZeroY = false, hasNonZeroZ = false;
    for (let i = 0; i < count; i++) {
      if (arr[i * 16 + 12] !== 0) hasNonZeroX = true;
      if (arr[i * 16 + 13] !== 0) hasNonZeroY = true;
      if (arr[i * 16 + 14] !== 0) hasNonZeroZ = true;
    }
    expect(hasNonZeroX).toBe(true);
    expect(hasNonZeroY).toBe(true);
    expect(hasNonZeroZ).toBe(true);
  });

  it('T-056-28: material is transparent with depthWrite disabled', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'blend-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    expect(mat.transparent).toBe(true);
    expect(mat.depthWrite).toBe(false);
  });

  it('T-056-29: shader includes noise3d declarations (curl3 or snoise symbols)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'noise-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    const vertSrc = mat.vertexShader;
    expect(vertSrc).toMatch(/curl3|snoise/);
  });

  it('T-056-30: shader declares all required shared uniforms', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'uniform-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const mat = mesh.material as THREE.ShaderMaterial;
    const requiredUniforms = ['uTime', 'uBassEnergy', 'uTrebleEnergy', 'uOpacity', 'uMotionAmplitude', 'uDisplacementScale', 'uPaletteHue'];
    for (const u of requiredUniforms) {
      expect(mat.uniforms[u]).toBeDefined();
    }
  });

  it('T-056-31: instanceMatrix evolves over time (non-static animation)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'evolve-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;

    micro.draw(scene, makeFrame({ elapsed: 0, params: { ...defaultParams, bassEnergy: 0.5, trebleEnergy: 0.5 } }));
    const frame0 = new Float32Array(mesh.instanceMatrix.array);

    micro.draw(scene, makeFrame({ elapsed: 5000, params: { ...defaultParams, bassEnergy: 0.5, trebleEnergy: 0.5 } }));
    const frame5 = new Float32Array(mesh.instanceMatrix.array);

    let diffSum = 0;
    for (let i = 0; i < frame0.length; i++) {
      diffSum += Math.abs(frame5[i] - frame0[i]);
    }
    expect(diffSum).toBeGreaterThan(0);
  });

  it('T-056-32: no localStorage or cookie access during init/draw operations', () => {
    const lsSpy = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'privacy-seed', defaultParams);
    micro.draw(scene, makeFrame());
    expect(lsSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('T-056-33: all instanceMatrix values remain finite after draw with extreme audio params', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'finite-seed', defaultParams);
    micro.draw(scene, makeFrame({ elapsed: 10000, params: { ...defaultParams, bassEnergy: 1.0, trebleEnergy: 1.0, motionAmplitude: 1.0 } }));
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < arr.length; i++) {
      expect(Number.isFinite(arr[i])).toBe(true);
    }
  });

  it('T-056-34: multiple draw calls do not throw or leak objects into the scene', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'leak-seed', defaultParams);
    const childCount = scene.children.length;
    for (let i = 0; i < 10; i++) {
      micro.draw(scene, makeFrame({ elapsed: i * 100 }));
    }
    expect(scene.children.length).toBe(childCount);
  });

  it('T-056-35: geometry uses small primitives (bounding box radius < 0.1)', () => {
    const scene = new THREE.Scene();
    const micro = createMicroGeometry();
    micro.init(scene, 'size-seed', defaultParams);
    const mesh = scene.children.find((c) => c instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    const geo = mesh.geometry as THREE.BufferGeometry;
    geo.computeBoundingSphere();
    expect(geo.boundingSphere!.radius).toBeLessThan(0.1);
  });
});

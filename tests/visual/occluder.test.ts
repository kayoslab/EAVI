import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';

/**
 * US-070: Occluder utility module tests.
 *
 * These tests verify the occluder material factory, InstancedMesh creation,
 * and uniform synchronization utilities that will be implemented in
 * src/visual/occluder.ts.
 */

describe('US-070: Occluder utility module', () => {
  describe('createOccluderMaterial', () => {
    it('T-070-01: returns a ShaderMaterial with colorWrite=false', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat).toBeInstanceOf(THREE.ShaderMaterial);
      expect(mat.colorWrite).toBe(false);
    });

    it('T-070-02: material has depthWrite=true', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat.depthWrite).toBe(true);
    });

    it('T-070-03: material has depthTest=true', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat.depthTest).toBe(true);
    });

    it('T-070-04: material has transparent=false', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat.transparent).toBe(false);
    });

    it('T-070-05: material has polygonOffset enabled with factor=1, units=1', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat.polygonOffset).toBe(true);
      expect(mat.polygonOffsetFactor).toBe(1);
      expect(mat.polygonOffsetUnits).toBe(1);
    });

    it('T-070-06: material has side=FrontSide', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', {});
      expect(mat.side).toBe(THREE.FrontSide);
    });

    it('T-070-07: material includes provided uniforms', async () => {
      const { createOccluderMaterial } = await import('../../src/visual/occluder');
      const uniforms = {
        uTime: { value: 0.0 },
        uBassEnergy: { value: 0.5 },
      };
      const mat = createOccluderMaterial('void main() { gl_Position = vec4(0.0); }', uniforms);
      expect(mat.uniforms.uTime).toBeDefined();
      expect(mat.uniforms.uBassEnergy).toBeDefined();
    });
  });

  describe('createInstancedCubeOccluder', () => {
    it('T-070-08: creates an InstancedMesh with correct instance count', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const cubeCount = 10;
      const offsets = new Float32Array(cubeCount * 3);
      const scales = new Float32Array(cubeCount);
      for (let i = 0; i < cubeCount; i++) {
        offsets[i * 3] = i * 0.5;
        offsets[i * 3 + 1] = 0;
        offsets[i * 3 + 2] = 0;
        scales[i] = 1.0;
      }
      const uniforms = { uTime: { value: 0.0 } };
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, uniforms);
      expect(mesh).toBeInstanceOf(THREE.InstancedMesh);
      expect(mesh.count).toBe(cubeCount);
    });

    it('T-070-09: InstancedMesh uses BoxGeometry as base', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const offsets = new Float32Array([0, 0, 0]);
      const scales = new Float32Array([1.0]);
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, {});
      expect(mesh.geometry).toBeInstanceOf(THREE.BoxGeometry);
    });

    it('T-070-10: InstancedMesh has renderOrder=-1 (renders before edges)', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const offsets = new Float32Array([0, 0, 0]);
      const scales = new Float32Array([1.0]);
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, {});
      expect(mesh.renderOrder).toBe(-1);
    });

    it('T-070-11: InstancedMesh material has colorWrite=false', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const offsets = new Float32Array([0, 0, 0]);
      const scales = new Float32Array([1.0]);
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, {});
      const mat = mesh.material as THREE.ShaderMaterial;
      expect(mat.colorWrite).toBe(false);
    });

    it('T-070-12: instanceMatrix entries are set (not all identity)', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const cubeCount = 3;
      const offsets = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9]);
      const scales = new Float32Array([0.5, 0.8, 1.2]);
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, {});
      // Check that at least one instance matrix differs from identity
      const matrix = new THREE.Matrix4();
      const identity = new THREE.Matrix4();
      let hasNonIdentity = false;
      for (let i = 0; i < cubeCount; i++) {
        mesh.getMatrixAt(i, matrix);
        if (!matrix.equals(identity)) {
          hasNonIdentity = true;
          break;
        }
      }
      expect(hasNonIdentity).toBe(true);
    });

    it('T-070-13: instance matrices encode correct offsets and scales', async () => {
      const { createInstancedCubeOccluder } = await import('../../src/visual/occluder');
      const offsets = new Float32Array([2, 3, 4]);
      const scales = new Float32Array([0.5]);
      const mesh = createInstancedCubeOccluder(offsets, scales, 1.0, {});
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scl = new THREE.Vector3();
      matrix.decompose(pos, quat, scl);
      // Position should reflect offset
      expect(pos.x).toBeCloseTo(2, 1);
      expect(pos.y).toBeCloseTo(3, 1);
      expect(pos.z).toBeCloseTo(4, 1);
      // Scale should reflect the cube's scale
      expect(scl.x).toBeCloseTo(0.5, 1);
      expect(scl.y).toBeCloseTo(0.5, 1);
      expect(scl.z).toBeCloseTo(0.5, 1);
    });
  });

  describe('syncOccluderUniforms', () => {
    it('T-070-14: copies all deformation uniforms from source to occluder material', async () => {
      const { syncOccluderUniforms } = await import('../../src/visual/occluder');
      const sourceUniforms: Record<string, { value: unknown }> = {
        uTime: { value: 42.0 },
        uBassEnergy: { value: 0.7 },
        uTrebleEnergy: { value: 0.3 },
        uMotionAmplitude: { value: 0.9 },
        uPointerDisturbance: { value: 0.1 },
        uPointerPos: { value: new THREE.Vector2(0.2, 0.4) },
        uCadence: { value: 0.6 },
        uBreathScale: { value: 1.02 },
        uNoiseFrequency: { value: 1.5 },
        uRadialScale: { value: 0.8 },
        uTwistStrength: { value: 0.5 },
        uFieldSpread: { value: 1.2 },
        uDisplacementScale: { value: 0.45 },
        uEnableSlowModulation: { value: 1.0 },
        uEnablePointerRepulsion: { value: 1.0 },
        uNoiseOctaves: { value: 3 },
      };

      const occluderMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0.0 },
          uBassEnergy: { value: 0.0 },
          uTrebleEnergy: { value: 0.0 },
          uMotionAmplitude: { value: 0.0 },
          uPointerDisturbance: { value: 0.0 },
          uPointerPos: { value: new THREE.Vector2(0, 0) },
          uCadence: { value: 0.0 },
          uBreathScale: { value: 1.0 },
          uNoiseFrequency: { value: 0.0 },
          uRadialScale: { value: 0.0 },
          uTwistStrength: { value: 0.0 },
          uFieldSpread: { value: 0.0 },
          uDisplacementScale: { value: 0.0 },
          uEnableSlowModulation: { value: 0.0 },
          uEnablePointerRepulsion: { value: 0.0 },
          uNoiseOctaves: { value: 1 },
        },
      });

      // Create a mock mesh with this material
      const occluderMesh = new THREE.Mesh(new THREE.BoxGeometry(), occluderMat);
      syncOccluderUniforms(occluderMesh, sourceUniforms);

      expect(occluderMat.uniforms.uTime.value).toBe(42.0);
      expect(occluderMat.uniforms.uBassEnergy.value).toBe(0.7);
      expect(occluderMat.uniforms.uTrebleEnergy.value).toBe(0.3);
      expect(occluderMat.uniforms.uMotionAmplitude.value).toBe(0.9);
      expect(occluderMat.uniforms.uPointerDisturbance.value).toBe(0.1);
      expect(occluderMat.uniforms.uCadence.value).toBe(0.6);
      expect(occluderMat.uniforms.uBreathScale.value).toBe(1.02);
      expect(occluderMat.uniforms.uNoiseFrequency.value).toBe(1.5);
      expect(occluderMat.uniforms.uRadialScale.value).toBe(0.8);
      expect(occluderMat.uniforms.uTwistStrength.value).toBe(0.5);
      expect(occluderMat.uniforms.uFieldSpread.value).toBe(1.2);
      expect(occluderMat.uniforms.uDisplacementScale.value).toBe(0.45);
    });

    it('T-070-15: sync only updates uniforms present on both source and target', async () => {
      const { syncOccluderUniforms } = await import('../../src/visual/occluder');
      const sourceUniforms: Record<string, { value: unknown }> = {
        uTime: { value: 10.0 },
        uOpacity: { value: 0.5 }, // occluder shouldn't have this
        uPaletteHue: { value: 200 }, // color uniform not needed on occluder
      };

      const occluderMat = new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0.0 },
        },
      });

      const occluderMesh = new THREE.Mesh(new THREE.BoxGeometry(), occluderMat);
      syncOccluderUniforms(occluderMesh, sourceUniforms);

      expect(occluderMat.uniforms.uTime.value).toBe(10.0);
      // Uniforms not on occluder should not be added
      expect(occluderMat.uniforms.uOpacity).toBeUndefined();
    });
  });
});

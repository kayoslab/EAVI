import * as THREE from 'three';
import noise3dGlsl from './shaders/noise3d.glsl?raw';
import occluderFrag from './shaders/occluder.frag.glsl?raw';
import occluderInstancedVert from './shaders/occluderInstanced.vert.glsl?raw';

const instancedVertexShader = noise3dGlsl + '\n' + occluderInstancedVert;
const fragmentShader = occluderFrag;

/**
 * Create an occluder ShaderMaterial that writes to depth buffer only.
 */
export function createOccluderMaterial(
  vertexShader: string,
  uniforms: Record<string, { value: unknown }>,
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { ...uniforms },
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    transparent: false,
    side: THREE.FrontSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
}

/**
 * Create an InstancedMesh of unit cubes for depth occlusion.
 */
export function createInstancedCubeOccluder(
  offsets: Float32Array,
  scales: Float32Array,
  _normScale: number,
  uniforms: Record<string, { value: unknown }>,
): THREE.InstancedMesh {
  const cubeCount = scales.length;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const material = createOccluderMaterial(instancedVertexShader, uniforms);

  const mesh = new THREE.InstancedMesh(geometry, material, cubeCount);
  mesh.renderOrder = -1;

  const matrix = new THREE.Matrix4();
  for (let i = 0; i < cubeCount; i++) {
    const ox = offsets[i * 3];
    const oy = offsets[i * 3 + 1];
    const oz = offsets[i * 3 + 2];
    const s = scales[i];
    matrix.makeScale(s, s, s);
    matrix.setPosition(ox, oy, oz);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  return mesh;
}

/**
 * Copy deformation uniforms from edge material to occluder material.
 * Only updates uniforms that exist on both source and target.
 */
export function syncOccluderUniforms(
  occluderMesh: THREE.Mesh | THREE.InstancedMesh,
  sourceUniforms: Record<string, { value: unknown }>,
): void {
  const mat = occluderMesh.material as THREE.ShaderMaterial;
  const target = mat.uniforms;
  for (const key in sourceUniforms) {
    if (key in target) {
      target[key].value = sourceUniforms[key].value;
    }
  }
}

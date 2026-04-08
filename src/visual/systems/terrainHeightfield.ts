import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import terrainVert from '../shaders/terrain.vert.glsl?raw';
import terrainFrag from '../shaders/terrain.frag.glsl?raw';
import terrainVertexVert from '../shaders/terrainVertex.vert.glsl?raw';
import terrainVertexFrag from '../shaders/terrainVertex.frag.glsl?raw';
import { generateTerrainHeightfield } from '../generators/terrainHeightfield';
import { extractUniqueVertices } from '../generators/extractVertices';

const edgeVertexShader = noise3dGlsl + '\n' + terrainVert;
const edgeFragmentShader = chromaticDispersionGlsl + '\n' + terrainFrag;
const vertexDotVertShader = noise3dGlsl + '\n' + terrainVertexVert;
const vertexDotFragShader = chromaticDispersionGlsl + '\n' + terrainVertexFrag;

export interface TerrainHeightfieldConfig {
  rows?: number;
  cols?: number;
  noiseOctaves?: 1 | 2 | 3;
}

export function createTerrainHeightfield(config?: TerrainHeightfieldConfig): GeometrySystem & {
  cleanup(): void;
  setOpacity(opacity: number): void;
} {
  const rows = config?.rows ?? 40;
  const cols = config?.cols ?? 60;
  const noiseOctaves = config?.noiseOctaves ?? 3;

  let edgeMesh: THREE.LineSegments | null = null;
  let vertexMesh: THREE.Points | null = null;
  let sceneRef: Scene | null = null;

  function createUniforms(params: VisualParams): Record<string, { value: unknown }> {
    return {
      uTime: { value: 0.0 },
      uBassEnergy: { value: 0.0 },
      uTrebleEnergy: { value: 0.0 },
      uOpacity: { value: 1.0 },
      uMotionAmplitude: { value: params.motionAmplitude },
      uPointerDisturbance: { value: 0.0 },
      uPointerPos: { value: new THREE.Vector2(0, 0) },
      uPaletteHue: { value: params.paletteHue },
      uPaletteSaturation: { value: params.paletteSaturation },
      uCadence: { value: params.cadence },
      uNoiseFrequency: { value: params.noiseFrequency },
      uNoiseOctaves: { value: noiseOctaves },
      uFogNear: { value: 3.0 },
      uFogFar: { value: 12.0 },
    };
  }

  function updateUniforms(
    uniforms: Record<string, { value: unknown }>,
    frame: FrameState,
  ): void {
    const {
      bassEnergy, trebleEnergy, pointerDisturbance,
      motionAmplitude, paletteHue, paletteSaturation, cadence,
      noiseFrequency,
    } = frame.params;
    const elapsed = frame.elapsed ?? 0;
    const pointerX = (frame.pointerX ?? 0.5) - 0.5;
    const pointerY = (frame.pointerY ?? 0.5) - 0.5;

    uniforms.uTime.value = elapsed;
    uniforms.uBassEnergy.value = bassEnergy;
    uniforms.uTrebleEnergy.value = trebleEnergy;
    uniforms.uMotionAmplitude.value = motionAmplitude;
    uniforms.uPointerDisturbance.value = pointerDisturbance;
    (uniforms.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
    uniforms.uPaletteHue.value = paletteHue;
    uniforms.uPaletteSaturation.value = paletteSaturation;
    uniforms.uCadence.value = cadence;
    uniforms.uNoiseFrequency.value = noiseFrequency;
  }

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      sceneRef = scene;

      const terrainData = generateTerrainHeightfield({
        rows,
        cols,
        seed: seed + ':terrain',
      });

      // --- Edge LineSegments mesh ---
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(terrainData.positions, 3));
      edgeGeometry.setAttribute('aRandom', new THREE.BufferAttribute(terrainData.randoms, 3));

      const edgeMaterial = new THREE.ShaderMaterial({
        vertexShader: edgeVertexShader,
        fragmentShader: edgeFragmentShader,
        uniforms: createUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);

      // --- Vertex Points mesh ---
      const vertexData = extractUniqueVertices(terrainData.positions);
      const vertexGeometry = new THREE.BufferGeometry();
      vertexGeometry.setAttribute('position', new THREE.BufferAttribute(vertexData.positions, 3));
      vertexGeometry.setAttribute('aRandom', new THREE.BufferAttribute(vertexData.aRandom, 3));

      const vertexMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexDotVertShader,
        fragmentShader: vertexDotFragShader,
        uniforms: createUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      vertexMesh = new THREE.Points(vertexGeometry, vertexMaterial);

      // --- Position for perspective depth (terrain receding toward horizon) ---
      const terrainPosition = new THREE.Vector3(0, -2, -3);
      const terrainRotation = new THREE.Euler(-Math.PI * 0.3, 0, 0);

      edgeMesh.position.copy(terrainPosition);
      edgeMesh.rotation.copy(terrainRotation);
      vertexMesh.position.copy(terrainPosition);
      vertexMesh.rotation.copy(terrainRotation);

      scene.add(edgeMesh);
      scene.add(vertexMesh);
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!edgeMesh || !vertexMesh) return;

      const eu = (edgeMesh.material as THREE.ShaderMaterial).uniforms;
      updateUniforms(eu, frame);

      const vu = (vertexMesh.material as THREE.ShaderMaterial).uniforms;
      updateUniforms(vu, frame);
    },

    setOpacity(opacity: number): void {
      if (edgeMesh) {
        (edgeMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
      if (vertexMesh) {
        (vertexMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        if (edgeMesh) {
          sceneRef.remove(edgeMesh);
          edgeMesh.geometry.dispose();
          (edgeMesh.material as THREE.Material).dispose();
        }
        if (vertexMesh) {
          sceneRef.remove(vertexMesh);
          vertexMesh.geometry.dispose();
          (vertexMesh.material as THREE.Material).dispose();
        }
      }
      edgeMesh = null;
      vertexMesh = null;
      sceneRef = null;
    },
  };
}

import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import terrainLineVert from '../shaders/terrain.vert.glsl?raw';
import terrainLineFrag from '../shaders/terrain.frag.glsl?raw';
import terrainVertexVert from '../shaders/terrainVertex.vert.glsl?raw';
import terrainVertexFrag from '../shaders/terrainVertex.frag.glsl?raw';
import { generateTerrainHeightfield } from '../generators/terrainHeightfield';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';

const meshVertShader = noise3dGlsl + '\n' + terrainLineVert;
const meshFragShader = chromaticDispersionGlsl + '\n' + terrainLineFrag;
const dotVertShader = noise3dGlsl + '\n' + terrainVertexVert;
const dotFragShader = chromaticDispersionGlsl + '\n' + terrainVertexFrag;

export interface TerrainWireframeConfig {
  rows?: number;
  cols?: number;
  noiseOctaves?: 1 | 2 | 3;
  dofStrength?: number;
}

export function createTerrainWireframe(config?: TerrainWireframeConfig): GeometrySystem & {
  cleanup(): void;
  setOpacity(opacity: number): void;
} {
  const rows = config?.rows ?? 150;
  const cols = config?.cols ?? 200;
  const noiseOctaves = config?.noiseOctaves ?? 3;

  let triMesh: THREE.Mesh | null = null;
  let pointsMesh: THREE.Points | null = null;
  let sceneRef: Scene | null = null;

  function createMeshUniforms(params: VisualParams): Record<string, { value: unknown }> {
    return {
      uTime: { value: 0.0 },
      uBassEnergy: { value: 0.0 },
      uBeatPulse: { value: 0.0 },
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
      uFogNear: { value: 5.0 },
      uFogFar: { value: 80.0 },
      uMidEnergy: { value: 0.0 },
      uHasVertexColor: { value: 1.0 },
    };
  }

  function createPointUniforms(params: VisualParams): Record<string, { value: unknown }> {
    return {
      uTime: { value: 0.0 },
      uBassEnergy: { value: 0.0 },
      uBeatPulse: { value: 0.0 },
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
      uFogNear: { value: 5.0 },
      uFogFar: { value: 80.0 },
      uMidEnergy: { value: 0.0 },
      uHasVertexColor: { value: 1.0 },
      uFocusDistance: { value: 15.0 },
      uDofStrength: { value: config?.dofStrength ?? 0.2 },
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
    uniforms.uBeatPulse.value = frame.params.beatPulse;
    uniforms.uTrebleEnergy.value = trebleEnergy;
    uniforms.uMotionAmplitude.value = motionAmplitude;
    uniforms.uPointerDisturbance.value = pointerDisturbance;
    (uniforms.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
    uniforms.uPaletteHue.value = paletteHue;
    uniforms.uPaletteSaturation.value = paletteSaturation;
    uniforms.uCadence.value = cadence;
    uniforms.uNoiseFrequency.value = noiseFrequency;
    uniforms.uMidEnergy.value = frame.params.midEnergy;
  }

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      sceneRef = scene;

      const cellRows = Math.max(1, rows - 1);
      const cellCols = Math.max(1, cols - 1);

      const data = generateTerrainHeightfield({
        rows: cellRows,
        cols: cellCols,
        seed: seed + ':terrain',
        width: 120,
        depth: 160,
        heightScale: 3.0,
        octaves: noiseOctaves,
      });

      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'terrain-wireframe' });

      // --- Triangle mesh (wireframe mode renders triangle edges) ---
      const meshGeom = new THREE.BufferGeometry();
      meshGeom.setAttribute('position', new THREE.BufferAttribute(data.vertexPositions, 3));
      meshGeom.setAttribute('aRandom', new THREE.BufferAttribute(data.vertexRandoms, 3));
      const meshColors = computeVertexColors(data.vertexPositions, gradient, { axis: 'z', itemStride: 3 });
      meshGeom.setAttribute('aVertexColor', new THREE.BufferAttribute(meshColors, 3));
      meshGeom.setIndex(new THREE.BufferAttribute(data.triangleIndices, 1));

      const meshMaterial = new THREE.ShaderMaterial({
        vertexShader: meshVertShader,
        fragmentShader: meshFragShader,
        uniforms: createMeshUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        wireframe: true,
      });

      triMesh = new THREE.Mesh(meshGeom, meshMaterial);
      triMesh.position.set(0, -2.0, 5.0);
      scene.add(triMesh);

      // --- Points mesh (vertex glow dots at grid intersections) ---
      const pointGeom = new THREE.BufferGeometry();
      pointGeom.setAttribute('position', new THREE.BufferAttribute(data.vertexPositions.slice(), 3));
      pointGeom.setAttribute('aRandom', new THREE.BufferAttribute(data.vertexRandoms.slice(), 3));
      pointGeom.setAttribute('aVertexColor', new THREE.BufferAttribute(meshColors.slice(), 3));

      const pointMaterial = new THREE.ShaderMaterial({
        vertexShader: dotVertShader,
        fragmentShader: dotFragShader,
        uniforms: createPointUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      pointsMesh = new THREE.Points(pointGeom, pointMaterial);
      pointsMesh.position.set(0, -2.0, 5.0);
      scene.add(pointsMesh);
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (triMesh) {
        updateUniforms((triMesh.material as THREE.ShaderMaterial).uniforms, frame);
      }
      if (pointsMesh) {
        updateUniforms((pointsMesh.material as THREE.ShaderMaterial).uniforms, frame);
        const elapsed = frame.elapsed ?? 0;
        const pu = (pointsMesh.material as THREE.ShaderMaterial).uniforms;
        pu.uFocusDistance.value = 15.0 + Math.sin(elapsed * 0.0001) * 2.0;
      }
    },

    setOpacity(opacity: number): void {
      if (triMesh) {
        (triMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
      if (pointsMesh) {
        (pointsMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        if (triMesh) {
          sceneRef.remove(triMesh);
          triMesh.geometry.dispose();
          (triMesh.material as THREE.Material).dispose();
        }
        if (pointsMesh) {
          sceneRef.remove(pointsMesh);
          pointsMesh.geometry.dispose();
          (pointsMesh.material as THREE.Material).dispose();
        }
      }
      triMesh = null;
      pointsMesh = null;
      sceneRef = null;
    },
  };
}

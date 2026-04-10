import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import terrainVertexVert from '../shaders/terrainVertex.vert.glsl?raw';
import terrainVertexFrag from '../shaders/terrainVertex.frag.glsl?raw';
import { generateTerrainParticleSheet } from '../generators/terrainParticleSheet';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';

const vertexDotVertShader = noise3dGlsl + '\n' + terrainVertexVert;
const vertexDotFragShader = chromaticDispersionGlsl + '\n' + terrainVertexFrag;

export interface TerrainHeightfieldConfig {
  rows?: number;
  cols?: number;
  pointCount?: number;
  noiseOctaves?: 1 | 2 | 3;
}

export function createTerrainHeightfield(config?: TerrainHeightfieldConfig): GeometrySystem & {
  cleanup(): void;
  setOpacity(opacity: number): void;
} {
  const rows = config?.rows ?? 40;
  const cols = config?.cols ?? 60;
  const pointCount = config?.pointCount ?? 60000;
  const noiseOctaves = config?.noiseOctaves ?? 3;

  let pointsMesh: THREE.Points | null = null;
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
      uHasVertexColor: { value: 1.0 },
      uFocusDistance: { value: 5.0 },
      uDofStrength: { value: 0.6 },
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

    // DoF focus distance modulation
    const baseFocus = 5.0;
    const focusDrift = Math.sin(elapsed * 0.0002) * 0.5;
    uniforms.uFocusDistance.value = baseFocus + focusDrift;
  }

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      sceneRef = scene;

      const sheetData = generateTerrainParticleSheet({
        rows,
        cols,
        pointCount,
        seed: seed + ':terrain',
      });

      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'terrain' });

      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(sheetData.positions, 3));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(sheetData.randoms, 3));
      const vertexColors = computeVertexColors(sheetData.positions, gradient, { axis: 'y', itemStride: 3 });
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));

      const material = new THREE.ShaderMaterial({
        vertexShader: vertexDotVertShader,
        fragmentShader: vertexDotFragShader,
        uniforms: createUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      pointsMesh = new THREE.Points(geometry, material);

      const terrainPosition = new THREE.Vector3(0, -1.5, -2);
      const terrainRotation = new THREE.Euler(-Math.PI * 0.38, 0, 0);

      pointsMesh.position.copy(terrainPosition);
      pointsMesh.rotation.copy(terrainRotation);

      scene.add(pointsMesh);
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!pointsMesh) return;

      const vu = (pointsMesh.material as THREE.ShaderMaterial).uniforms;
      updateUniforms(vu, frame);
    },

    setOpacity(opacity: number): void {
      if (pointsMesh) {
        (pointsMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        if (pointsMesh) {
          sceneRef.remove(pointsMesh);
          pointsMesh.geometry.dispose();
          (pointsMesh.material as THREE.Material).dispose();
        }
      }
      pointsMesh = null;
      sceneRef = null;
    },
  };
}

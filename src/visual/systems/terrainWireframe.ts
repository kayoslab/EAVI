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

const lineVertShader = noise3dGlsl + '\n' + terrainLineVert;
const lineFragShader = chromaticDispersionGlsl + '\n' + terrainLineFrag;
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

  let linesMesh: THREE.LineSegments | null = null;
  let pointsMesh: THREE.Points | null = null;
  let sceneRef: Scene | null = null;

  function createLineUniforms(params: VisualParams): Record<string, { value: unknown }> {
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
      uFogNear: { value: 5.0 },
      uFogFar: { value: 80.0 },
      uHasVertexColor: { value: 1.0 },
    };
  }

  function createPointUniforms(params: VisualParams): Record<string, { value: unknown }> {
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
      uFogNear: { value: 5.0 },
      uFogFar: { value: 80.0 },
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

      // Use rows-1/cols-1 for the cell grid so vertex count = rows * cols
      const cellRows = Math.max(1, rows - 1);
      const cellCols = Math.max(1, cols - 1);

      const heightfieldData = generateTerrainHeightfield({
        rows: cellRows,
        cols: cellCols,
        seed: seed + ':terrain',
        width: 60,
        depth: 160,
        heightScale: 3.0,
        octaves: noiseOctaves,
      });

      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'terrain-wireframe' });

      // --- LineSegments mesh (grid lines) ---
      const lineGeom = new THREE.BufferGeometry();
      lineGeom.setAttribute('position', new THREE.BufferAttribute(heightfieldData.positions, 3));
      lineGeom.setAttribute('aRandom', new THREE.BufferAttribute(heightfieldData.randoms, 3));
      const lineColors = computeVertexColors(heightfieldData.positions, gradient, { axis: 'z', itemStride: 3 });
      lineGeom.setAttribute('aVertexColor', new THREE.BufferAttribute(lineColors, 3));

      const lineMaterial = new THREE.ShaderMaterial({
        vertexShader: lineVertShader,
        fragmentShader: lineFragShader,
        uniforms: createLineUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      linesMesh = new THREE.LineSegments(lineGeom, lineMaterial);
      linesMesh.position.set(0, -2.0, 5.0);
      scene.add(linesMesh);

      // --- Points mesh (vertex dots) ---
      const pointGeom = new THREE.BufferGeometry();
      pointGeom.setAttribute('position', new THREE.BufferAttribute(heightfieldData.vertexPositions, 3));
      pointGeom.setAttribute('aRandom', new THREE.BufferAttribute(heightfieldData.vertexRandoms, 3));
      const pointColors = computeVertexColors(heightfieldData.vertexPositions, gradient, { axis: 'z', itemStride: 3 });
      pointGeom.setAttribute('aVertexColor', new THREE.BufferAttribute(pointColors, 3));

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
      if (linesMesh) {
        updateUniforms((linesMesh.material as THREE.ShaderMaterial).uniforms, frame);
      }
      if (pointsMesh) {
        updateUniforms((pointsMesh.material as THREE.ShaderMaterial).uniforms, frame);
        const elapsed = frame.elapsed ?? 0;
        const pu = (pointsMesh.material as THREE.ShaderMaterial).uniforms;
        const baseFocus = 15.0;
        const focusDrift = Math.sin(elapsed * 0.0001) * 2.0;
        pu.uFocusDistance.value = baseFocus + focusDrift;
      }
    },

    setOpacity(opacity: number): void {
      if (linesMesh) {
        (linesMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
      if (pointsMesh) {
        (pointsMesh.material as THREE.ShaderMaterial).uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (sceneRef) {
        if (linesMesh) {
          sceneRef.remove(linesMesh);
          linesMesh.geometry.dispose();
          (linesMesh.material as THREE.Material).dispose();
        }
        if (pointsMesh) {
          sceneRef.remove(pointsMesh);
          pointsMesh.geometry.dispose();
          (pointsMesh.material as THREE.Material).dispose();
        }
      }
      linesMesh = null;
      pointsMesh = null;
      sceneRef = null;
    },
  };
}

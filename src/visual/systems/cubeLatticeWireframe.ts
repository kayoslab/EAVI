import * as THREE from 'three';
import type { Scene } from 'three';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import wireframeVert from '../shaders/wireframe.vert.glsl?raw';
import wireframeFrag from '../shaders/wireframe.frag.glsl?raw';
import wireframeVertexVert from '../shaders/wireframeVertex.vert.glsl?raw';
import wireframeVertexFrag from '../shaders/wireframeVertex.frag.glsl?raw';
import { generateCubeLattice } from '../generators/cubeLattice';

const standardVertexShader = noise3dGlsl + '\n' + wireframeVert;
const standardFragmentShader = chromaticDispersionGlsl + '\n' + wireframeFrag;
const vertexDotVertShader = noise3dGlsl + '\n' + wireframeVertexVert;
const vertexDotFragShader = chromaticDispersionGlsl + '\n' + wireframeVertexFrag;

export interface CubeLatticeConfig {
  gridSize?: number;
  cellSize?: number;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  jitter?: number;
  voidDensity?: number;
}

export function createCubeLatticeWireframe(config?: CubeLatticeConfig): GeometrySystem & {
  cleanup(): void;
  setOpacity(opacity: number): void;
} {
  const gridSize = config?.gridSize ?? 5;
  const cellSize = config?.cellSize ?? 1.0;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;
  const jitter = config?.jitter ?? 0.3;
  const voidDensity = config?.voidDensity ?? 0.3;

  let edgeMesh: THREE.LineSegments | null = null;
  let vertexMesh: THREE.Points | null = null;
  let sceneRef: Scene | null = null;

  function createEdgeUniforms(params: VisualParams): Record<string, { value: unknown }> {
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
      uBreathScale: { value: 1.0 },
      uNoiseFrequency: { value: params.noiseFrequency },
      uRadialScale: { value: params.radialScale },
      uTwistStrength: { value: params.twistStrength },
      uFieldSpread: { value: params.fieldSpread },
      uNoiseOctaves: { value: noiseOctaves },
      uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
      uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
      uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
      uFogNear: { value: 3.0 },
      uFogFar: { value: 8.0 },
      uDispersion: { value: 0.0 },
    };
  }

  function createVertexDotUniforms(params: VisualParams): Record<string, { value: unknown }> {
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
      uBreathScale: { value: 1.0 },
      uNoiseFrequency: { value: params.noiseFrequency },
      uRadialScale: { value: params.radialScale },
      uTwistStrength: { value: params.twistStrength },
      uFieldSpread: { value: params.fieldSpread },
      uNoiseOctaves: { value: noiseOctaves },
      uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
      uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
      uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
      uFogNear: { value: 3.0 },
      uFogFar: { value: 8.0 },
      uDispersion: { value: 0.0 },
      uBasePointSize: { value: 0.06 },
    };
  }

  return {
    init(scene: Scene, seed: string, params: VisualParams): void {
      sceneRef = scene;

      const lattice = generateCubeLattice({ gridSize, cellSize, seed, jitter, voidDensity });

      // --- Edge LineSegments mesh ---
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(lattice.edges.positions, 3));
      edgeGeometry.setAttribute('aRandom', new THREE.BufferAttribute(lattice.edges.randoms, 3));

      const edgeMaterial = new THREE.ShaderMaterial({
        vertexShader: standardVertexShader,
        fragmentShader: standardFragmentShader,
        uniforms: createEdgeUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      scene.add(edgeMesh);

      // --- Vertex Points mesh ---
      const vertexGeometry = new THREE.BufferGeometry();
      vertexGeometry.setAttribute('position', new THREE.BufferAttribute(lattice.vertices.positions, 3));
      vertexGeometry.setAttribute('aRandom', new THREE.BufferAttribute(lattice.vertices.aRandom, 3));
      vertexGeometry.setAttribute('aConnectivity', new THREE.BufferAttribute(lattice.vertices.connectivity, 1));

      const vertexMaterial = new THREE.ShaderMaterial({
        vertexShader: vertexDotVertShader,
        fragmentShader: vertexDotFragShader,
        uniforms: createVertexDotUniforms(params),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      vertexMesh = new THREE.Points(vertexGeometry, vertexMaterial);
      scene.add(vertexMesh);
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!edgeMesh || !vertexMesh) return;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;

      // Update edge uniforms
      const eu = (edgeMesh.material as THREE.ShaderMaterial).uniforms;
      eu.uTime.value = elapsed;
      eu.uBassEnergy.value = bassEnergy;
      eu.uTrebleEnergy.value = trebleEnergy;
      eu.uMotionAmplitude.value = motionAmplitude;
      eu.uPointerDisturbance.value = pointerDisturbance;
      (eu.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
      eu.uPaletteHue.value = paletteHue;
      eu.uPaletteSaturation.value = paletteSaturation;
      eu.uCadence.value = cadence;
      eu.uNoiseFrequency.value = noiseFrequency;
      eu.uRadialScale.value = radialScale;
      eu.uTwistStrength.value = twistStrength;
      eu.uFieldSpread.value = fieldSpread;
      eu.uDisplacementScale.value = motionAmplitude * structureComplexity;
      eu.uDispersion.value = frame.params.dispersion ?? 0.0;
      eu.uBreathScale.value = breathScale;

      // Update vertex dot uniforms
      const vu = (vertexMesh.material as THREE.ShaderMaterial).uniforms;
      vu.uTime.value = elapsed;
      vu.uBassEnergy.value = bassEnergy;
      vu.uTrebleEnergy.value = trebleEnergy;
      vu.uMotionAmplitude.value = motionAmplitude;
      vu.uPointerDisturbance.value = pointerDisturbance;
      (vu.uPointerPos.value as THREE.Vector2).set(pointerX, pointerY);
      vu.uPaletteHue.value = paletteHue;
      vu.uPaletteSaturation.value = paletteSaturation;
      vu.uCadence.value = cadence;
      vu.uNoiseFrequency.value = noiseFrequency;
      vu.uRadialScale.value = radialScale;
      vu.uTwistStrength.value = twistStrength;
      vu.uFieldSpread.value = fieldSpread;
      vu.uDisplacementScale.value = motionAmplitude * structureComplexity;
      vu.uDispersion.value = frame.params.dispersion ?? 0.0;
      vu.uBreathScale.value = breathScale;
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

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import crystalWarpVert from '../shaders/crystalWarp.vert.glsl?raw';
import crystalWarpFrag from '../shaders/crystalWarp.frag.glsl?raw';
import { generateLatticeCluster } from '../generators/latticeCluster';
import { computeAdaptiveCount } from './pointCloud';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';

const vertexShader = noise3dGlsl + '\n' + crystalWarpVert;
const fragmentShader = chromaticDispersionGlsl + '\n' + crystalWarpFrag;

const DEFAULT_MAX_POINTS = 6400;

export interface CrystalFieldConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  dofStrength?: number;
}

export interface CrystalField extends GeometrySystem {
  readonly pointCount: number;
  readonly positions: Float32Array | null;
  cleanup(): void;
}

export function createCrystalField(config?: CrystalFieldConfig): CrystalField {
  const maxPoints = config?.maxPoints ?? DEFAULT_MAX_POINTS;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;

  let effectiveCount = 0;
  let pointsMesh: THREE.Points | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;
  let basePositions: Float32Array | null = null;

  return {
    get pointCount() {
      return effectiveCount;
    },

    get positions() {
      return basePositions ? Float32Array.from(basePositions) : null;
    },

    init(scene: Scene, seed: string, params: VisualParams): void {
      const rng = createPRNG(seed + ':crystal');

      effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxPoints);

      // Lattice cluster configuration — keep total within maxPoints
      let nodeCount = Math.max(1, Math.round(6 + params.structureComplexity * 6)); // 6-12 nodes
      let pointsPerCrystal = Math.max(200, Math.floor(effectiveCount / nodeCount));
      // If total exceeds budget, reduce node count first, then cap points per crystal
      while (nodeCount > 1 && nodeCount * pointsPerCrystal > maxPoints) {
        nodeCount--;
        pointsPerCrystal = Math.max(200, Math.floor(effectiveCount / nodeCount));
      }
      if (nodeCount * pointsPerCrystal > maxPoints) {
        pointsPerCrystal = Math.floor(maxPoints / nodeCount);
      }
      effectiveCount = nodeCount * pointsPerCrystal;

      const latticeResult = generateLatticeCluster({
        nodeCount,
        pointsPerCrystal,
        latticeType: 'hex',
        latticeSpacing: 1.2 + params.structureComplexity * 0.6,
        crystalHeight: 1.0,
        crystalRadius: 0.4,
        seed: seed + ':crystal',
      });

      const positionsArr = latticeResult.positions;

      const sizesArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      for (let i = 0; i < effectiveCount; i++) {
        sizesArr[i] = 0.03 + rng() * 0.04;

        aRandomArr[i * 3] = rng();
        aRandomArr[i * 3 + 1] = rng();
        aRandomArr[i * 3 + 2] = rng();
      }

      basePositions = Float32Array.from(positionsArr);

      // Vibrant spatial gradient vertex colors
      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'vibrant', familyHint: 'crystal' });
      const vertexColors = computeVertexColors(positionsArr, gradient, { axis: 'radial' });

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));
      geometry.setAttribute('aLatticePos', new THREE.BufferAttribute(latticeResult.latticePositions, 3));
      geometry.setAttribute('aFacetNormal', new THREE.BufferAttribute(latticeResult.facetNormals, 3));

      const uniforms = {
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
        uBreathScale: { value: 1.0 },
        uBasePointSize: { value: 0.06 * (1 + params.structureComplexity * 0.5) },
        uNoiseFrequency: { value: 1.0 },
        uRadialScale: { value: 1.0 },
        uTwistStrength: { value: 1.0 },
        uFieldSpread: { value: 1.0 },
        uNoiseOctaves: { value: noiseOctaves },
        uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
        uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
        uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
        uHasSizeAttr: { value: 1.0 },
        uHasVertexColor: { value: 1.0 },
        uHasLatticePos: { value: 1.0 },
        uHasFacetNormal: { value: 1.0 },
        uLatticePulse: { value: 0.0 },
        uFacetShimmer: { value: 0.0 },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 8.0 },
        uMidEnergy: { value: 0.0 },
        uDispersion: { value: 0.0 },
        uFocusDistance: { value: 5.0 },
        uDofStrength: { value: config?.dofStrength ?? 0.6 },
      };

      shaderMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      pointsMesh = new THREE.Points(geometry, shaderMaterial);
      scene.add(pointsMesh);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!geometry || !pointsMesh || !shaderMaterial) return;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation, cadence,
        structureComplexity, noiseFrequency, radialScale, twistStrength, fieldSpread,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const u = shaderMaterial.uniforms;
      u.uTime.value = elapsed;
      u.uBassEnergy.value = bassEnergy;
      u.uBeatPulse.value = frame.params.beatPulse;
      u.uTrebleEnergy.value = trebleEnergy;
      u.uMotionAmplitude.value = motionAmplitude;
      u.uPointerDisturbance.value = pointerDisturbance;
      u.uPointerPos.value.set(pointerX, pointerY);
      u.uPaletteHue.value = paletteHue;
      u.uPaletteSaturation.value = paletteSaturation;
      u.uCadence.value = cadence;
      u.uBasePointSize.value = 0.08 * (1 + structureComplexity * 0.5);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;
      u.uDispersion.value = frame.params.dispersion ?? 0.0;
      u.uMidEnergy.value = frame.params.midEnergy;
      u.uLatticePulse.value = bassEnergy;
      u.uFacetShimmer.value = trebleEnergy;

      // Breathing scale (two harmonics)
      const breathScale = 1
        + Math.sin(elapsed * 0.0004) * 0.08 * motionAmplitude
        + Math.sin(elapsed * 0.00015) * 0.05 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // DoF focus distance modulation
      const baseFocus = 5.0;
      const focusDrift = Math.sin(elapsed * 0.0002) * 0.5;
      u.uFocusDistance.value = baseFocus + focusDrift;

      // Multi-axis rotation
      const yDrift = Math.sin(elapsed / 20000 * Math.PI * 2) * 0.15 * motionAmplitude;
      pointsMesh.rotation.y = yDrift + bassEnergy * motionAmplitude * 0.1 * Math.sin(elapsed * 0.0003);
      pointsMesh.rotation.x = Math.sin(elapsed / 35000 * Math.PI * 2) * 0.12 * motionAmplitude;
      pointsMesh.rotation.z = Math.sin(elapsed / 50000 * Math.PI * 2) * 0.08 * motionAmplitude;

      // Slow scale pulsing
      const scalePulse = 1.0 + Math.sin(elapsed / 20000 * Math.PI * 2) * 0.1 * motionAmplitude;
      pointsMesh.scale.setScalar(scalePulse);

      // Z-axis breathing (two harmonics)
      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude
        + Math.sin(elapsed / 30000 * Math.PI * 2) * 0.2 * motionAmplitude;
      pointsMesh.position.z = zBreath;
    },

    setOpacity(opacity: number): void {
      if (shaderMaterial) {
        shaderMaterial.uniforms.uOpacity.value = opacity;
      }
    },

    cleanup(): void {
      if (pointsMesh && sceneRef) {
        sceneRef.remove(pointsMesh);
      }
      if (geometry) {
        geometry.dispose();
      }
      if (shaderMaterial) {
        shaderMaterial.dispose();
      }
      pointsMesh = null;
      geometry = null;
      shaderMaterial = null;
      basePositions = null;
      sceneRef = null;
    },
  };
}

export function getPointCount(crystal: CrystalField): number {
  return crystal.pointCount;
}

export function getPointPositions(crystal: CrystalField): Float32Array | null {
  return crystal.positions;
}

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import crystalWarpVert from '../shaders/crystalWarp.vert.glsl?raw';
import fragmentShader from '../shaders/crystalWarp.frag.glsl?raw';
import { generateVolumetricPoints } from '../generators/volumetricPoints';
import type { VolumetricShape } from '../generators/volumetricPoints';

const vertexShader = noise3dGlsl + '\n' + crystalWarpVert;

const DEFAULT_MAX_POINTS = 1200;
const CRYSTAL_SHAPES: VolumetricShape[] = ['crystalCluster', 'geode'];

export interface CrystalFieldConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
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

      const baseCount = Math.floor(params.density * maxPoints);
      effectiveCount = Math.max(1, Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4)));
      if (effectiveCount > maxPoints) effectiveCount = maxPoints;

      if (params.density === 0) {
        effectiveCount = 1;
      }

      // Select from crystal-only shapes
      const shapeIndex = Math.floor(rng() * CRYSTAL_SHAPES.length) % CRYSTAL_SHAPES.length;
      const shape: VolumetricShape = CRYSTAL_SHAPES[shapeIndex];

      const positionsArr = generateVolumetricPoints({
        shape,
        pointCount: effectiveCount,
        seed: seed + ':crystal',
      });

      const colorsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const hueOffsetsArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      const color = new THREE.Color();

      for (let i = 0; i < effectiveCount; i++) {
        hueOffsetsArr[i] = (rng() - 0.5) * 40;

        const hue = ((params.paletteHue + hueOffsetsArr[i]) % 360 + 360) % 360;
        color.setHSL(hue / 360, params.paletteSaturation, 0.6);
        colorsArr[i * 3] = color.r;
        colorsArr[i * 3 + 1] = color.g;
        colorsArr[i * 3 + 2] = color.b;

        sizesArr[i] = 0.03 + rng() * 0.04;

        aRandomArr[i * 3] = rng();
        aRandomArr[i * 3 + 1] = rng();
        aRandomArr[i * 3 + 2] = rng();
      }

      basePositions = Float32Array.from(positionsArr);

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aHueOffset', new THREE.BufferAttribute(hueOffsetsArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));

      const uniforms = {
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
      u.uTrebleEnergy.value = trebleEnergy;
      u.uMotionAmplitude.value = motionAmplitude;
      u.uPointerDisturbance.value = pointerDisturbance;
      u.uPointerPos.value.set(pointerX, pointerY);
      u.uPaletteHue.value = paletteHue;
      u.uPaletteSaturation.value = paletteSaturation;
      u.uCadence.value = cadence;
      u.uBasePointSize.value = 0.06 * (1 + structureComplexity * 0.5);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;

      // Breathing scale
      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // Two-axis rotation: Y drift + bass, X cadence-driven tilt
      const driftPeriod = 20000;
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.15 * motionAmplitude;
      const bassRotation = bassEnergy * motionAmplitude * 0.1;
      pointsMesh.rotation.y = driftAngle + bassRotation * Math.sin(elapsed * 0.0003);

      // X-axis tilt for sculptural tumbling
      const tiltAngle = Math.sin(elapsed / 25000 * Math.PI * 2) * 0.1 * motionAmplitude;
      pointsMesh.rotation.x = tiltAngle + bassEnergy * 0.05 * Math.cos(elapsed * 0.00025);

      // Z-axis breathing
      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude;
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

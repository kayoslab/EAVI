import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import vertexShader from '../shaders/pointWarp.vert.glsl?raw';
import fragmentShader from '../shaders/pointWarp.frag.glsl?raw';

const DEFAULT_MAX_POINTS = 1200;

export interface PointCloudConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
}

export interface PointCloud extends GeometrySystem {
  readonly pointCount: number;
  readonly positions: Float32Array | null;
  cleanup(): void;
}

export function createPointCloud(config?: PointCloudConfig): PointCloud {
  const maxPoints = config?.maxPoints ?? DEFAULT_MAX_POINTS;

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
      const rng = createPRNG(seed + ':pointcloud');

      const baseCount = Math.floor(params.density * maxPoints);
      effectiveCount = Math.max(1, Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4)));
      if (effectiveCount > maxPoints) effectiveCount = maxPoints;

      // Handle density=0 edge case
      if (params.density === 0) {
        effectiveCount = 1;
      }

      const positionsArr = new Float32Array(effectiveCount * 3);
      const colorsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const hueOffsetsArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      const color = new THREE.Color();

      for (let i = 0; i < effectiveCount; i++) {
        let x: number, y: number, z: number;

        const shapeRoll = rng();

        if (shapeRoll < 0.6) {
          // Shell point — radius ~2 with perturbation
          const theta = rng() * Math.PI * 2;
          const phi = Math.acos(2 * rng() - 1);
          const radius = 2 + (rng() - 0.5) * 0.6;
          x = radius * Math.sin(phi) * Math.cos(theta);
          y = radius * Math.sin(phi) * Math.sin(theta);
          z = radius * Math.cos(phi);
        } else {
          // Interior volume point
          const theta = rng() * Math.PI * 2;
          const phi = Math.acos(2 * rng() - 1);
          const radius = rng() * 1.8;
          x = radius * Math.sin(phi) * Math.cos(theta);
          y = radius * Math.sin(phi) * Math.sin(theta);
          z = radius * Math.cos(phi);
        }

        // Lattice snapping for high structureComplexity
        if (params.structureComplexity > 0.7) {
          const snap = 0.5;
          const blend = (params.structureComplexity - 0.7) / 0.3;
          x = x * (1 - blend) + Math.round(x / snap) * snap * blend;
          y = y * (1 - blend) + Math.round(y / snap) * snap * blend;
          z = z * (1 - blend) + Math.round(z / snap) * snap * blend;
        }

        // Softness interpolation — curveSoftness blends between angular and smooth
        if (params.curveSoftness < 0.5) {
          const angularity = 1 - params.curveSoftness * 2;
          x += (rng() - 0.5) * 0.2 * angularity;
          y += (rng() - 0.5) * 0.2 * angularity;
          z += (rng() - 0.5) * 0.2 * angularity;
        }

        positionsArr[i * 3] = x;
        positionsArr[i * 3 + 1] = y;
        positionsArr[i * 3 + 2] = z;

        // Per-point hue offset for color variation
        hueOffsetsArr[i] = (rng() - 0.5) * 40;

        // Initial colors
        const hue = ((params.paletteHue + hueOffsetsArr[i]) % 360 + 360) % 360;
        color.setHSL(hue / 360, params.paletteSaturation, 0.6);
        colorsArr[i * 3] = color.r;
        colorsArr[i * 3 + 1] = color.g;
        colorsArr[i * 3 + 2] = color.b;

        // Per-point size variation
        sizesArr[i] = 0.03 + rng() * 0.04;

        // Per-point random values for GPU noise variation
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
        uMotionAmplitude: { value: params.motionAmplitude },
        uPointerDisturbance: { value: 0.0 },
        uPointerPos: { value: new THREE.Vector2(0, 0) },
        uPaletteHue: { value: params.paletteHue },
        uPaletteSaturation: { value: params.paletteSaturation },
        uCadence: { value: params.cadence },
        uBreathScale: { value: 1.0 },
        uBasePointSize: { value: 0.06 * (1 + params.structureComplexity * 0.5) },
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
        structureComplexity,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      // Update uniforms — GPU handles all deformation
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

      // Time-based breathing scale
      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // Mesh-level rotation — single matrix op, kept on CPU
      const driftPeriod = 20000;
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.15 * motionAmplitude;
      pointsMesh.rotation.y = driftAngle;

      // Bass-driven macro rotation offset
      const bassRotation = bassEnergy * motionAmplitude * 0.1;
      pointsMesh.rotation.y += bassRotation * Math.sin(elapsed * 0.0003);

      // Z-axis breathing
      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude;
      pointsMesh.position.z = zBreath;
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

export function getPointCount(cloud: PointCloud): number {
  return cloud.pointCount;
}

export function getPointPositions(cloud: PointCloud): Float32Array | null {
  return cloud.positions;
}

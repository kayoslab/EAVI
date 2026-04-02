import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';

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
  const enableSparkle = config?.enableSparkle ?? true;

  let effectiveCount = 0;
  let pointsMesh: THREE.Points | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.PointsMaterial | null = null;
  let sceneRef: Scene | null = null;
  let basePositions: Float32Array | null = null;
  let hueOffsets: Float32Array | null = null;

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
      hueOffsets = new Float32Array(effectiveCount);

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
        hueOffsets[i] = (rng() - 0.5) * 40;

        // Initial colors
        const hue = ((params.paletteHue + hueOffsets[i]) % 360 + 360) % 360;
        color.setHSL(hue / 360, params.paletteSaturation, 0.6);
        colorsArr[i * 3] = color.r;
        colorsArr[i * 3 + 1] = color.g;
        colorsArr[i * 3 + 2] = color.b;

        // Per-point size variation
        sizesArr[i] = 0.03 + rng() * 0.04;
      }

      basePositions = Float32Array.from(positionsArr);

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colorsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));

      material = new THREE.PointsMaterial({
        size: 0.06 * (1 + params.structureComplexity * 0.5),
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      pointsMesh = new THREE.Points(geometry, material);
      scene.add(pointsMesh);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!geometry || !pointsMesh || !basePositions || !hueOffsets) return;

      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;
      const colors = colorAttr.array as Float32Array;

      const {
        bassEnergy, trebleEnergy, pointerDisturbance,
        motionAmplitude, paletteHue, paletteSaturation,
      } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const color = new THREE.Color();

      // Camera drift — rotate mesh for parallax
      const driftPeriod = 20000; // 20s period
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.15 * motionAmplitude;
      pointsMesh.rotation.y = driftAngle;

      // Z-axis breathing
      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude;
      pointsMesh.position.z = zBreath;

      // Bass-driven macro rotation offset
      const bassRotation = bassEnergy * motionAmplitude * 0.1;
      pointsMesh.rotation.y += bassRotation * Math.sin(elapsed * 0.0003);

      // Time-based breathing scale
      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;

      for (let i = 0; i < effectiveCount; i++) {
        const i3 = i * 3;
        const bx = basePositions[i3];
        const by = basePositions[i3 + 1];
        const bz = basePositions[i3 + 2];

        // Bass-driven macro drift
        const bassDrift = bassEnergy * motionAmplitude * 0.25;
        const driftX = Math.sin(elapsed * 0.0004 + i * 0.11) * bassDrift;
        const driftY = Math.cos(elapsed * 0.0003 + i * 0.13) * bassDrift;
        const driftZ = Math.sin(elapsed * 0.0005 + i * 0.07) * bassDrift;

        // Treble-driven per-point jitter
        const trebleJitter = trebleEnergy * motionAmplitude * 0.12;
        const jitterX = (Math.sin(elapsed * 0.011 + i * 7.3) * 2 - 1) * trebleJitter;
        const jitterY = (Math.cos(elapsed * 0.013 + i * 5.7) * 2 - 1) * trebleJitter;
        const jitterZ = (Math.sin(elapsed * 0.009 + i * 3.1) * 2 - 1) * trebleJitter;

        // Pointer disturbance — radial repulsion
        let ptrOffsetX = 0;
        let ptrOffsetY = 0;
        if (pointerDisturbance > 0) {
          const dx = (bx / 3) - pointerX;
          const dy = (by / 3) - pointerY;
          const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
          const influence = Math.max(0, 1 - dist * 2) * pointerDisturbance * motionAmplitude * 0.5;
          ptrOffsetX = dx * influence;
          ptrOffsetY = dy * influence;
        }

        // Apply breathing scale
        positions[i3] = (bx + driftX + jitterX + ptrOffsetX) * breathScale;
        positions[i3 + 1] = (by + driftY + jitterY + ptrOffsetY) * breathScale;
        positions[i3 + 2] = (bz + driftZ + jitterZ) * breathScale;

        // Update colors
        const hue = ((paletteHue + hueOffsets[i]) % 360 + 360) % 360;
        const lightness = enableSparkle && trebleEnergy > 0.5
          ? 0.6 + Math.sin(elapsed * 0.02 + i * 1.3) * 0.15 * trebleEnergy
          : 0.6;
        color.setHSL(hue / 360, paletteSaturation, lightness);
        colors[i3] = color.r;
        colors[i3 + 1] = color.g;
        colors[i3 + 2] = color.b;
      }

      posAttr.needsUpdate = true;
      colorAttr.needsUpdate = true;
    },

    cleanup(): void {
      if (pointsMesh && sceneRef) {
        sceneRef.remove(pointsMesh);
      }
      if (geometry) {
        geometry.dispose();
      }
      if (material) {
        material.dispose();
      }
      pointsMesh = null;
      geometry = null;
      material = null;
      basePositions = null;
      hueOffsets = null;
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

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import { validateGeometryAttributes } from '../geometryValidator';
import { POINTCLOUD_ATTRIBUTES, OPTIONAL_POINTCLOUD_ATTRIBUTES } from '../shaderRegistry';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import pointWarpVert from '../shaders/pointWarp.vert.glsl?raw';
import defaultFragShader from '../shaders/pointWarp.frag.glsl?raw';
import voronoiFragShader from '../shaders/voronoiCell.frag.glsl?raw';

const vertexShader = noise3dGlsl + '\n' + pointWarpVert;
import { generateVolumetricPoints, VOLUMETRIC_SHAPES, PARAMETRIC_SHAPES } from '../generators/volumetricPoints';
import type { VolumetricShape } from '../generators/volumetricPoints';

const DEFAULT_MAX_POINTS = 8000;

/**
 * Shared adaptive point count formula.
 * Encapsulates: floor(density * maxPoints * (0.6 + complexity * 0.4))
 * with a minimum floor of 24 points for visible volumetric shape.
 */
export function computeAdaptiveCount(density: number, structureComplexity: number, maxPoints: number): number {
  if (density === 0) return 24;
  const baseCount = Math.floor(density * maxPoints);
  const scaled = Math.floor(baseCount * (0.6 + structureComplexity * 0.4));
  return Math.max(24, Math.min(scaled, maxPoints));
}

const REQUIRED_ATTRIBUTES = POINTCLOUD_ATTRIBUTES;

export interface PointCloudConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  useVoronoiShader?: boolean;
}

export interface PointCloud extends GeometrySystem {
  readonly pointCount: number;
  readonly positions: Float32Array | null;
  cleanup(): void;
}

export function createPointCloud(config?: PointCloudConfig): PointCloud {
  const maxPoints = config?.maxPoints ?? DEFAULT_MAX_POINTS;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;
  const useVoronoiShader = config?.useVoronoiShader ?? false;
  const fragmentShader = chromaticDispersionGlsl + '\n' + (useVoronoiShader ? voronoiFragShader : defaultFragShader);

  let effectiveCount = 0;
  let pointsMesh: THREE.Points | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;
  let basePositions: Float32Array | null = null;
  let isParametric = false;
  let baseFocusDistance = 5.0;
  let meshBaseZ = 0;

  return {
    get pointCount() {
      return effectiveCount;
    },

    get positions() {
      return basePositions ? Float32Array.from(basePositions) : null;
    },

    init(scene: Scene, seed: string, params: VisualParams): void {
      const rng = createPRNG(seed + ':pointcloud');

      effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxPoints);

      // Weighted shape selection: parametric shapes get ~70% on medium/high tier
      const isLowTier = maxPoints <= 200;
      const originalShapes = VOLUMETRIC_SHAPES.filter(
        (s) => !(PARAMETRIC_SHAPES as readonly string[]).includes(s),
      );
      let shape: VolumetricShape;
      if (isLowTier) {
        // Low tier: only original shapes
        const idx = Math.floor(rng() * originalShapes.length) % originalShapes.length;
        shape = originalShapes[idx];
      } else {
        // Medium/high: 70% parametric, 30% original
        const roll = rng();
        if (roll < 0.7) {
          const idx = Math.floor(rng() * PARAMETRIC_SHAPES.length) % PARAMETRIC_SHAPES.length;
          shape = PARAMETRIC_SHAPES[idx];
        } else {
          const idx = Math.floor(rng() * originalShapes.length) % originalShapes.length;
          shape = originalShapes[idx];
        }
      }

      isParametric = (PARAMETRIC_SHAPES as readonly string[]).includes(shape);

      // Apply 1.5x point budget multiplier for parametric shapes
      if (isParametric) {
        effectiveCount = Math.min(Math.floor(effectiveCount * 1.5), maxPoints);
      }

      // Generate base volumetric positions
      const positionsArr = generateVolumetricPoints({
        shape,
        pointCount: effectiveCount,
        seed: seed + ':pointcloud',
      });

      const sizesArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      for (let i = 0; i < effectiveCount; i++) {
        let x = positionsArr[i * 3];
        let y = positionsArr[i * 3 + 1];
        let z = positionsArr[i * 3 + 2];

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

        // Per-point size variation
        sizesArr[i] = 0.03 + rng() * 0.04;

        // Per-point random values for GPU noise variation
        aRandomArr[i * 3] = rng();
        aRandomArr[i * 3 + 1] = rng();
        aRandomArr[i * 3 + 2] = rng();
      }

      basePositions = Float32Array.from(positionsArr);

      // Vibrant spatial gradient vertex colors
      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'vibrant', familyHint: 'pointcloud' });
      const vertexColors = computeVertexColors(positionsArr, gradient, { axis: 'x' });

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));

      const validation = validateGeometryAttributes(geometry, REQUIRED_ATTRIBUTES, OPTIONAL_POINTCLOUD_ATTRIBUTES);
      if (!validation.ok) {
        throw new Error(
          'PointCloud geometry validation failed: ' +
          validation.errors.map((e) => `${e.attribute}: ${e.reason}`).join('; '),
        );
      }

      const uniforms: Record<string, { value: unknown }> = {
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
        uBasePointSize: { value: 0.06 * (1 + params.structureComplexity * 0.5) * (isParametric ? 1.3 : 1.0) },
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
        uFogNear: { value: isParametric ? 1.5 : 3.0 },
        uFogFar: { value: isParametric ? 6.0 : 8.0 },
        uDispersion: { value: 0.0 },
        uFocusDistance: { value: isParametric ? 3.5 : 5.0 },
        uDofStrength: { value: 0.6 },
      };

      if (useVoronoiShader) {
        uniforms.uVoronoiGridSize = { value: 4.0 };
      }

      shaderMaterial = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      pointsMesh = new THREE.Points(geometry, shaderMaterial);

      // Bring parametric shapes closer to camera
      if (isParametric) {
        meshBaseZ = -1.5;
        pointsMesh.position.z = meshBaseZ;
        baseFocusDistance = 3.5;
      } else {
        meshBaseZ = 0;
        baseFocusDistance = 5.0;
      }

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
      u.uBasePointSize.value = 0.06 * (1 + structureComplexity * 0.5) * (isParametric ? 1.3 : 1.0);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;
      u.uDispersion.value = frame.params.dispersion ?? 0.0;

      if (useVoronoiShader && u.uVoronoiGridSize) {
        u.uVoronoiGridSize.value = 3.0 + structureComplexity * 3.0;
      }

      // Time-based breathing scale (two harmonics for organic feel)
      const breathScale = 1
        + Math.sin(elapsed * 0.0004) * 0.08 * motionAmplitude
        + Math.sin(elapsed * 0.00015) * 0.05 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // DoF focus distance modulation (shape-aware)
      const focusDrift = Math.sin(elapsed * 0.0002) * 0.5;
      u.uFocusDistance.value = baseFocusDistance + focusDrift;

      // Multi-axis rotation — Y drift + X tilt + Z roll
      const yDrift = Math.sin(elapsed / 25000 * Math.PI * 2) * 0.15 * motionAmplitude;
      const xTilt = Math.sin(elapsed / 40000 * Math.PI * 2) * 0.12 * motionAmplitude;
      const zRoll = Math.sin(elapsed / 60000 * Math.PI * 2) * 0.08 * motionAmplitude;
      pointsMesh.rotation.y = yDrift + bassEnergy * motionAmplitude * 0.1 * Math.sin(elapsed * 0.0003);
      pointsMesh.rotation.x = xTilt;
      pointsMesh.rotation.z = zRoll;

      // Z-axis breathing (two harmonics)
      const zBreath = Math.sin(elapsed / 15000 * Math.PI * 2) * 0.3 * motionAmplitude
        + Math.sin(elapsed / 30000 * Math.PI * 2) * 0.2 * motionAmplitude;
      pointsMesh.position.z = meshBaseZ + zBreath;
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

export function getPointCount(cloud: PointCloud): number {
  return cloud.pointCount;
}

export function getPointPositions(cloud: PointCloud): Float32Array | null {
  return cloud.positions;
}

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import { validateGeometryAttributes } from '../geometryValidator';
import { RIBBONFIELD_ATTRIBUTES, OPTIONAL_RIBBONFIELD_ATTRIBUTES } from '../shaderRegistry';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import parametricRibbonVert from '../shaders/parametricRibbon.vert.glsl?raw';
import parametricRibbonFrag from '../shaders/parametricRibbon.frag.glsl?raw';
import { computeAdaptiveCount } from './pointCloud';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';
import { selectCurveFamily, getSampler } from './parametricCurves';

const vertexShader = noise3dGlsl + '\n' + parametricRibbonVert;
const fragmentShader = chromaticDispersionGlsl + '\n' + parametricRibbonFrag;

const DEFAULT_MAX_POINTS = 5000;

const REQUIRED_ATTRIBUTES = RIBBONFIELD_ATTRIBUTES;

export interface RibbonFieldConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
}

export interface RibbonField extends GeometrySystem {
  readonly pointCount: number;
  readonly positions: Float32Array | null;
  cleanup(): void;
}

export function createRibbonField(config?: RibbonFieldConfig): RibbonField {
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
      const rng = createPRNG(seed + ':ribbon');

      effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxPoints);

      // Select parametric surface family from seed
      const family = selectCurveFamily(seed);
      const sampler = getSampler(family);

      // Determine ribbon band count: 3-5 seeded
      const bandCount = 4 + Math.floor(rng() * 4); // 4, 5, 6, or 7
      const pointsPerBand = Math.ceil(effectiveCount / bandCount);

      const positionsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);
      const aCurveParamArr = new Float32Array(effectiveCount);

      let idx = 0;
      for (let band = 0; band < bandCount && idx < effectiveCount; band++) {
        // Each band sits at a different v-offset on the parametric surface
        const vOffset = band / bandCount;
        const vSpread = 0.02 + rng() * 0.03; // narrow v-spread for ribbon width
        const ribbonWidth = 0.2 + rng() * 0.35;

        const bandPoints = Math.min(pointsPerBand, effectiveCount - idx);

        for (let p = 0; p < bandPoints; p++) {
          const u = p / Math.max(1, bandPoints - 1); // 0..1 along band
          const v = vOffset + (rng() - 0.5) * vSpread; // v with narrow spread

          const sample = sampler(u, v, seed);

          let x = sample.position[0];
          let y = sample.position[1];
          let z = sample.position[2];

          // Perpendicular spread using surface normal
          const spreadDist = (rng() - 0.5) * ribbonWidth;
          x += sample.normal[0] * spreadDist;
          y += sample.normal[1] * spreadDist;
          z += sample.normal[2] * spreadDist;

          // Lattice snapping for high structureComplexity
          if (params.structureComplexity > 0.7) {
            const snap = 0.5;
            const blend = (params.structureComplexity - 0.7) / 0.3;
            x = x * (1 - blend) + Math.round(x / snap) * snap * blend;
            y = y * (1 - blend) + Math.round(y / snap) * snap * blend;
            z = z * (1 - blend) + Math.round(z / snap) * snap * blend;
          }

          // Softness — add angular jitter for low curveSoftness
          if (params.curveSoftness < 0.5) {
            const angularity = 1 - params.curveSoftness * 2;
            x += (rng() - 0.5) * 0.2 * angularity;
            y += (rng() - 0.5) * 0.2 * angularity;
            z += (rng() - 0.5) * 0.2 * angularity;
          }

          positionsArr[idx * 3] = x;
          positionsArr[idx * 3 + 1] = y;
          positionsArr[idx * 3 + 2] = z;

          // Normalized u-parameter for GPU-side length-aware effects
          aCurveParamArr[idx] = u;

          // Per-point size variation
          sizesArr[idx] = 0.03 + rng() * 0.04;

          // Per-point random values for GPU noise
          aRandomArr[idx * 3] = rng();
          aRandomArr[idx * 3 + 1] = rng();
          aRandomArr[idx * 3 + 2] = rng();

          idx++;
        }
      }

      basePositions = Float32Array.from(positionsArr);

      // Vibrant spatial gradient vertex colors
      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'vibrant', familyHint: 'ribbon' });
      const vertexColors = computeVertexColors(positionsArr, gradient, { axis: 'z' });

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));
      geometry.setAttribute('aCurveParam', new THREE.BufferAttribute(aCurveParamArr, 1));

      const validation = validateGeometryAttributes(geometry, REQUIRED_ATTRIBUTES, OPTIONAL_RIBBONFIELD_ATTRIBUTES);
      if (!validation.ok) {
        throw new Error(
          'RibbonField geometry validation failed: ' +
          validation.errors.map((e) => `${e.attribute}: ${e.reason}`).join('; '),
        );
      }

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
        uHasVertexColor: { value: 1.0 },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 8.0 },
        uDispersion: { value: 0.0 },
        uFocusDistance: { value: 5.0 },
        uDofStrength: { value: 0.6 },
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
      u.uBasePointSize.value = 0.08 * (1 + structureComplexity * 0.5);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;
      u.uDispersion.value = frame.params.dispersion ?? 0.0;

      // Time-based breathing scale (two harmonics)
      const breathScale = 1
        + Math.sin(elapsed * 0.0004) * 0.08 * motionAmplitude
        + Math.sin(elapsed * 0.00015) * 0.05 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // DoF focus distance modulation
      const baseFocus = 5.0;
      const focusDrift = Math.sin(elapsed * 0.0002) * 0.5;
      u.uFocusDistance.value = baseFocus + focusDrift;

      // Multi-axis rotation
      const yDrift = Math.sin(elapsed / 25000 * Math.PI * 2) * 0.15 * motionAmplitude;
      const xTilt = Math.sin(elapsed / 40000 * Math.PI * 2) * 0.12 * motionAmplitude;
      const zRoll = Math.sin(elapsed / 60000 * Math.PI * 2) * 0.08 * motionAmplitude;
      pointsMesh.rotation.y = yDrift + bassEnergy * motionAmplitude * 0.1 * Math.sin(elapsed * 0.0003);
      pointsMesh.rotation.x = xTilt;
      pointsMesh.rotation.z = zRoll;

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

export function getPointCount(ribbon: RibbonField): number {
  return ribbon.pointCount;
}

export function getPointPositions(ribbon: RibbonField): Float32Array | null {
  return ribbon.positions;
}

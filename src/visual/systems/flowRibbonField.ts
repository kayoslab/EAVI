import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import { validateGeometryAttributes } from '../geometryValidator';
import { FLOWRIBBON_ATTRIBUTES, OPTIONAL_FLOWRIBBON_ATTRIBUTES } from '../shaderRegistry';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import flowRibbonVert from '../shaders/flowRibbon.vert.glsl?raw';
import fragmentShader from '../shaders/flowRibbon.frag.glsl?raw';
import { computeAdaptiveCount } from './pointCloud';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';

const vertexShader = noise3dGlsl + '\n' + flowRibbonVert;

const DEFAULT_MAX_POINTS = 5000;

const REQUIRED_ATTRIBUTES = FLOWRIBBON_ATTRIBUTES;

export interface FlowRibbonFieldConfig {
  maxPoints?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
}

export interface FlowRibbonField extends GeometrySystem {
  readonly pointCount: number;
  readonly positions: Float32Array | null;
  cleanup(): void;
}

export function createFlowRibbonField(config?: FlowRibbonFieldConfig): FlowRibbonField {
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
      const rng = createPRNG(seed + ':flowribbon');

      effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxPoints);

      // Streamline-based initial geometry:
      // Seed source points randomly in a sphere, then generate long trail points
      // by iteratively advecting along a pseudo-curl field for sweeping curves.
      const trailLength = 100; // points per streamline — long sweeping curves
      const sourceCount = Math.max(5, Math.ceil(effectiveCount / trailLength));

      const positionsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);
      const aTrailProgressArr = new Float32Array(effectiveCount);

      let idx = 0;
      for (let s = 0; s < sourceCount && idx < effectiveCount; s++) {
        // Random source point in a wider sphere for full-frame sweep
        const theta = rng() * Math.PI * 2;
        const phi = Math.acos(2 * rng() - 1);
        const r = 2.0 + rng() * 3.0;
        let sx = r * Math.sin(phi) * Math.cos(theta);
        let sy = r * Math.sin(phi) * Math.sin(theta);
        let sz = r * Math.cos(phi);

        const trailPts = Math.min(trailLength, effectiveCount - idx);

        for (let t = 0; t < trailPts; t++) {
          positionsArr[idx * 3] = sx;
          positionsArr[idx * 3 + 1] = sy;
          positionsArr[idx * 3 + 2] = sz;

          // Per-point size variation
          sizesArr[idx] = 0.03 + rng() * 0.04;

          // Trail progress: 0 at head, 1 at tail
          aTrailProgressArr[idx] = trailPts > 1 ? t / (trailPts - 1) : 0;

          // Per-point random values for GPU noise
          aRandomArr[idx * 3] = rng();
          aRandomArr[idx * 3 + 1] = rng();
          aRandomArr[idx * 3 + 2] = rng();

          idx++;

          // Advect along a pseudo-curl field with smaller steps for smoother curves
          // Higher frequencies ensure spatial spread across seeds
          const advectStep = 0.18;
          const nx = Math.sin(sy * 2.8 + sz * 1.1) * advectStep;
          const ny = Math.sin(sz * 2.5 + sx * 1.3) * advectStep;
          const nz = Math.sin(sx * 3.0 + sy * 0.9) * advectStep;
          sx += nx;
          sy += ny;
          sz += nz;
        }
      }

      basePositions = Float32Array.from(positionsArr);

      // Vibrant spatial gradient vertex colors
      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'vibrant', familyHint: 'flowribbon' });
      const vertexColors = computeVertexColors(positionsArr, gradient, { axis: 'radial' });

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));
      geometry.setAttribute('aTrailProgress', new THREE.BufferAttribute(aTrailProgressArr, 1));

      const validation = validateGeometryAttributes(geometry, REQUIRED_ATTRIBUTES, OPTIONAL_FLOWRIBBON_ATTRIBUTES);
      if (!validation.ok) {
        throw new Error(
          'FlowRibbonField geometry validation failed: ' +
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
        uNoiseFrequency: { value: params.noiseFrequency ?? 1.0 },
        uRadialScale: { value: params.radialScale ?? 1.0 },
        uTwistStrength: { value: params.twistStrength ?? 1.0 },
        uFieldSpread: { value: params.fieldSpread ?? 1.0 },
        uNoiseOctaves: { value: noiseOctaves },
        uEnablePointerRepulsion: { value: enablePointerRepulsion ? 1.0 : 0.0 },
        uEnableSlowModulation: { value: enableSlowModulation ? 1.0 : 0.0 },
        uDisplacementScale: { value: params.motionAmplitude * params.structureComplexity },
        uHasSizeAttr: { value: 1.0 },
        uHasVertexColor: { value: 1.0 },
        uFogNear: { value: 3.0 },
        uFogFar: { value: 10.0 },
        uFlowScale: { value: 1.0 },
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

      // Update uniforms
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
      u.uBasePointSize.value = 0.10 * (1 + structureComplexity * 0.5);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;
      u.uDisplacementScale.value = motionAmplitude * structureComplexity;

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

export function getPointCount(flow: FlowRibbonField): number {
  return flow.pointCount;
}

export function getPointPositions(flow: FlowRibbonField): Float32Array | null {
  return flow.positions;
}

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import vertexShader from '../shaders/ribbonWarp.vert.glsl?raw';
import fragmentShader from '../shaders/ribbonWarp.frag.glsl?raw';

const DEFAULT_MAX_POINTS = 1000;

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

      const baseCount = Math.floor(params.density * maxPoints);
      effectiveCount = Math.max(1, Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4)));
      if (effectiveCount > maxPoints) effectiveCount = maxPoints;

      // Handle density=0 edge case
      if (params.density === 0) {
        effectiveCount = 1;
      }

      // Determine ribbon band count: 3-5 seeded
      const bandCount = 3 + Math.floor(rng() * 3); // 3, 4, or 5
      const pointsPerBand = Math.ceil(effectiveCount / bandCount);

      const positionsArr = new Float32Array(effectiveCount * 3);
      const colorsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const hueOffsetsArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      const color = new THREE.Color();

      let idx = 0;
      for (let band = 0; band < bandCount && idx < effectiveCount; band++) {
        // Each band has its own helical parameters (seeded)
        const helixRadius = 1.2 + rng() * 1.6;   // 1.2 to 2.8
        const helixPitch = 1.0 + rng() * 3.0;     // vertical rise per revolution
        const phaseOffset = rng() * Math.PI * 2;   // angular offset
        const freqX = 1.0 + rng() * 2.0;           // Lissajous-like frequency ratios
        const freqZ = 1.0 + rng() * 2.0;
        const ribbonWidth = 0.15 + rng() * 0.25;   // perpendicular spread

        const bandPoints = Math.min(pointsPerBand, effectiveCount - idx);

        for (let p = 0; p < bandPoints; p++) {
          const t = p / Math.max(1, bandPoints - 1); // 0..1 along band

          // Parametric helix/spiral curve
          const angle = t * Math.PI * 4 + phaseOffset; // 2 full revolutions
          const cx = helixRadius * Math.cos(angle * freqX);
          const cy = (t - 0.5) * helixPitch * 2;
          const cz = helixRadius * Math.sin(angle * freqZ);

          // Perpendicular spread — approximate tangent and spread normal to it
          const spreadAngle = rng() * Math.PI * 2;
          const spreadDist = rng() * ribbonWidth;

          // Simple perpendicular offset (cross with up vector approximation)
          const tx = -Math.sin(angle * freqX) * freqX;
          const tz = Math.cos(angle * freqZ) * freqZ;
          const tLen = Math.sqrt(tx * tx + tz * tz) + 0.001;
          // Normal in XZ plane (perpendicular to tangent)
          const nx = -tz / tLen;
          const nz = tx / tLen;

          let x = cx + nx * Math.cos(spreadAngle) * spreadDist;
          let y = cy + Math.sin(spreadAngle) * spreadDist;
          let z = cz + nz * Math.cos(spreadAngle) * spreadDist;

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

          // Per-point hue offset
          hueOffsetsArr[idx] = (rng() - 0.5) * 40;

          // Initial colors
          const hue = ((params.paletteHue + hueOffsetsArr[idx]) % 360 + 360) % 360;
          color.setHSL(hue / 360, params.paletteSaturation, 0.6);
          colorsArr[idx * 3] = color.r;
          colorsArr[idx * 3 + 1] = color.g;
          colorsArr[idx * 3 + 2] = color.b;

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
      u.uBasePointSize.value = 0.06 * (1 + structureComplexity * 0.5);
      u.uNoiseFrequency.value = noiseFrequency;
      u.uRadialScale.value = radialScale;
      u.uTwistStrength.value = twistStrength;
      u.uFieldSpread.value = fieldSpread;

      // Time-based breathing scale
      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // Mesh-level Y-axis drift rotation
      const driftPeriod = 25000;
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.2 * motionAmplitude;
      pointsMesh.rotation.y = driftAngle;

      // Bass-driven macro rotation offset
      const bassRotation = bassEnergy * motionAmplitude * 0.12;
      pointsMesh.rotation.y += bassRotation * Math.sin(elapsed * 0.0003);

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

export function getPointCount(ribbon: RibbonField): number {
  return ribbon.pointCount;
}

export function getPointPositions(ribbon: RibbonField): Float32Array | null {
  return ribbon.positions;
}

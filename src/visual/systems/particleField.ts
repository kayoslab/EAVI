import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import { validateGeometryAttributes } from '../geometryValidator';
import { PARTICLEFIELD_ATTRIBUTES, OPTIONAL_PARTICLEFIELD_ATTRIBUTES } from '../shaderRegistry';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import particleWarpVert from '../shaders/particleWarp.vert.glsl?raw';
import fragmentShader from '../shaders/particleWarp.frag.glsl?raw';

// Prepend noise library; leading comment ensures curl3( call signature is
// discoverable before the library definition for shader-source inspection.
const vertexShader =
  '// displacement: curl3(pos * scale + vec3(t * speed), octaves) * uBassEnergy\n' +
  noise3dGlsl + '\n' + particleWarpVert;

const DEFAULT_MAX_PARTICLES = 600;

const REQUIRED_ATTRIBUTES = PARTICLEFIELD_ATTRIBUTES;

export interface ParticleFieldConfig {
  maxParticles?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  hueOffset: number;
}

export interface ParticleField extends GeometrySystem {
  readonly particleCount: number;
  readonly particles: Particle[];
  cleanup(): void;
}

export function createParticleField(config?: ParticleFieldConfig): ParticleField {
  const maxParticles = config?.maxParticles ?? DEFAULT_MAX_PARTICLES;
  const noiseOctaves = config?.noiseOctaves ?? 3;
  const enablePointerRepulsion = config?.enablePointerRepulsion ?? true;
  const enableSlowModulation = config?.enableSlowModulation ?? true;

  let effectiveCount = 0;
  let pointsMesh: THREE.Points | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let shaderMaterial: THREE.ShaderMaterial | null = null;
  let sceneRef: Scene | null = null;
  let storedParticles: Particle[] = [];

  return {
    get particleCount() {
      return effectiveCount;
    },

    get particles() {
      return storedParticles;
    },

    init(scene: Scene, seed: string, params: VisualParams): void {
      const rng = createPRNG(seed);
      const baseCount = Math.floor(params.density * maxParticles);
      effectiveCount = Math.max(1, Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4)));
      if (effectiveCount > maxParticles) effectiveCount = maxParticles;

      if (params.density === 0) {
        effectiveCount = 1;
      }

      storedParticles = [];
      const positionsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const hueOffsetsArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);

      for (let i = 0; i < effectiveCount; i++) {
        const px = rng();
        const py = rng();
        // Map 0-1 particle coords to 3D space centered at origin
        positionsArr[i * 3] = (px - 0.5) * 6;
        positionsArr[i * 3 + 1] = (py - 0.5) * 6;
        positionsArr[i * 3 + 2] = (rng() - 0.5) * 4;

        sizesArr[i] = 0.03 + rng() * 0.04;
        hueOffsetsArr[i] = (rng() - 0.5) * 30;

        storedParticles.push({
          x: px,
          y: py,
          vx: 0,
          vy: 0,
          size: sizesArr[i],
          hueOffset: hueOffsetsArr[i],
        });

        aRandomArr[i * 3] = rng();
        aRandomArr[i * 3 + 1] = rng();
        aRandomArr[i * 3 + 2] = rng();
      }

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aHueOffset', new THREE.BufferAttribute(hueOffsetsArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));

      const validation = validateGeometryAttributes(geometry, REQUIRED_ATTRIBUTES, OPTIONAL_PARTICLEFIELD_ATTRIBUTES);
      if (!validation.ok) {
        throw new Error(
          'ParticleField geometry validation failed: ' +
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

      const breathScale = 1 + Math.sin(elapsed * 0.0004) * 0.03 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // Mesh-level rotation
      const driftPeriod = 22000;
      const driftAngle = Math.sin(elapsed / driftPeriod * Math.PI * 2) * 0.15 * motionAmplitude;
      pointsMesh.rotation.y = driftAngle;

      const bassRotation = bassEnergy * motionAmplitude * 0.1;
      pointsMesh.rotation.y += bassRotation * Math.sin(elapsed * 0.0003);

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
      sceneRef = null;
    },
  };
}

export function getParticleCount(field: ParticleField): number {
  return field.particleCount;
}

export function getParticlePositions(
  field: ParticleField,
): Array<{ x: number; y: number }> {
  return field.particles.map((p) => ({ x: p.x, y: p.y }));
}

import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';
import { validateGeometryAttributes } from '../geometryValidator';
import { PARTICLEFIELD_ATTRIBUTES, OPTIONAL_PARTICLEFIELD_ATTRIBUTES } from '../shaderRegistry';
import { createSpatialGradient, computeVertexColors } from '../spatialGradient';
import noise3dGlsl from '../shaders/noise3d.glsl?raw';
import chromaticDispersionGlsl from '../shaders/chromaticDispersion.glsl?raw';
import particleWarpVert from '../shaders/particleWarp.vert.glsl?raw';
import particleWarpFrag from '../shaders/particleWarp.frag.glsl?raw';
import { computeAdaptiveCount } from './pointCloud';
import { buildCurlLUT, sampleCurl } from '../curlLUT';
import type { CurlLUT, Vec3 } from '../curlLUT';

// Prepend noise library for GPU-side treble micro-detail
const vertexShader = noise3dGlsl + '\n' + particleWarpVert;
const fragmentShader = chromaticDispersionGlsl + '\n' + particleWarpFrag;

const DEFAULT_MAX_PARTICLES = 3000;
const FADE_FRAMES = 30;
const BASE_SPEED = 0.008; // units/ms — particles always drift
const MAX_SPEED = 0.025;  // units/ms — velocity magnitude clamp

// Field bounds for recycling
const BOUNDS_X = 4;
const BOUNDS_Y = 4;
const BOUNDS_Z = 3;

const REQUIRED_ATTRIBUTES = PARTICLEFIELD_ATTRIBUTES;

export interface ParticleFieldConfig {
  maxParticles?: number;
  enableSparkle?: boolean;
  noiseOctaves?: 1 | 2 | 3;
  enablePointerRepulsion?: boolean;
  enableSlowModulation?: boolean;
  dofStrength?: number;
}

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  hueOffset: number;
  alpha: number;
  age: number;
}

interface Attractor {
  position: Vec3;
  strength: number;
  radius: number;
  phase: number;
}

export interface ParticleField extends GeometrySystem {
  readonly particleCount: number;
  readonly particles: Particle[];
  cleanup(): void;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
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
  let curlLut: CurlLUT | null = null;
  let attractors: Attractor[] = [];
  let rngRef: (() => number) | null = null;

  function respawnParticle(p: Particle, rng: () => number): void {
    // Place on a random face of the bounding box (opposite to exit direction)
    const face = Math.floor(rng() * 6);
    switch (face) {
      case 0: p.x = -BOUNDS_X; p.y = (rng() - 0.5) * 2 * BOUNDS_Y; p.z = (rng() - 0.5) * 2 * BOUNDS_Z; break;
      case 1: p.x = BOUNDS_X; p.y = (rng() - 0.5) * 2 * BOUNDS_Y; p.z = (rng() - 0.5) * 2 * BOUNDS_Z; break;
      case 2: p.y = -BOUNDS_Y; p.x = (rng() - 0.5) * 2 * BOUNDS_X; p.z = (rng() - 0.5) * 2 * BOUNDS_Z; break;
      case 3: p.y = BOUNDS_Y; p.x = (rng() - 0.5) * 2 * BOUNDS_X; p.z = (rng() - 0.5) * 2 * BOUNDS_Z; break;
      case 4: p.z = -BOUNDS_Z; p.x = (rng() - 0.5) * 2 * BOUNDS_X; p.y = (rng() - 0.5) * 2 * BOUNDS_Y; break;
      default: p.z = BOUNDS_Z; p.x = (rng() - 0.5) * 2 * BOUNDS_X; p.y = (rng() - 0.5) * 2 * BOUNDS_Y; break;
    }
    // Jitter to avoid grid-aligned entry
    p.x += (rng() - 0.5) * 0.5;
    p.y += (rng() - 0.5) * 0.5;
    p.z += (rng() - 0.5) * 0.5;
    p.vx = 0;
    p.vy = 0;
    p.vz = 0;
    p.alpha = 0;
    p.age = 0;
  }

  function advectParticles(dt: number, bassEnergy: number, elapsed: number): void {
    if (!curlLut || !rngRef) return;

    const fieldStrength = BASE_SPEED * (1.0 + bassEnergy * 0.8);

    // Stability guard 1: dt clamping
    const clampedDt = Math.min(dt, 33);
    if (clampedDt <= 0) return;

    // Stability guard 2: sub-stepping for large dt
    const subSteps = clampedDt > 20 ? Math.ceil(clampedDt / 16) : 1;
    const stepDt = clampedDt / subSteps;

    for (const p of storedParticles) {
      for (let s = 0; s < subSteps; s++) {
        // Sample curl field
        const curl = sampleCurl(curlLut, p.x, p.y, p.z);

        // Compute attractor multiplier
        let multiplier = 1.0;
        for (const a of attractors) {
          // Drifting attractor position
          const ax = a.position.x + Math.sin(elapsed * 0.0001 + a.phase) * 0.8;
          const ay = a.position.y + Math.cos(elapsed * 0.00012 + a.phase * 1.3) * 0.8;
          const az = a.position.z + Math.sin(elapsed * 0.00008 + a.phase * 0.7) * 0.5;

          const dx = p.x - ax;
          const dy = p.y - ay;
          const dz = p.z - az;
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          const falloff = smoothstep(a.radius, 0, dist);
          const effectiveStrength = a.strength * (1 + bassEnergy * 0.5);
          multiplier += effectiveStrength * falloff;
        }

        p.vx = curl.x * fieldStrength * multiplier;
        p.vy = curl.y * fieldStrength * multiplier;
        p.vz = curl.z * fieldStrength * multiplier;

        // Stability guard 3: velocity magnitude clamp
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
        if (speed > MAX_SPEED) {
          const scale = MAX_SPEED / speed;
          p.vx *= scale;
          p.vy *= scale;
          p.vz *= scale;
        }

        p.x += p.vx * stepDt;
        p.y += p.vy * stepDt;
        p.z += p.vz * stepDt;
      }

      p.age++;
      p.alpha = Math.min(1, p.age / FADE_FRAMES);

      // Recycling: respawn if out of bounds
      if (Math.abs(p.x) > BOUNDS_X || Math.abs(p.y) > BOUNDS_Y || Math.abs(p.z) > BOUNDS_Z) {
        respawnParticle(p, rngRef);
      }
    }
  }

  return {
    get particleCount() {
      return effectiveCount;
    },

    get particles() {
      return storedParticles;
    },

    init(scene: Scene, seed: string, params: VisualParams): void {
      const rng = createPRNG(seed);
      rngRef = createPRNG(seed + '-respawn');
      effectiveCount = computeAdaptiveCount(params.density, params.structureComplexity, maxParticles);

      // Build curl LUT from numeric seed
      const numericSeed = Array.from(seed).reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0) >>> 0;
      curlLut = buildCurlLUT(numericSeed, 32);

      // Create attractors (2-4 seeded positions)
      const attractorCount = 3 + Math.floor(rng() * 3); // 3-5
      attractors = [];
      for (let i = 0; i < attractorCount; i++) {
        attractors.push({
          position: {
            x: (rng() - 0.5) * 5,
            y: (rng() - 0.5) * 5,
            z: (rng() - 0.5) * 3,
          },
          strength: 2.0 + rng() * 2.0,
          radius: 1.0 + rng() * 1.5,
          phase: rng() * Math.PI * 2,
        });
      }

      storedParticles = [];
      const positionsArr = new Float32Array(effectiveCount * 3);
      const sizesArr = new Float32Array(effectiveCount);
      const aRandomArr = new Float32Array(effectiveCount * 3);
      const aAlphaArr = new Float32Array(effectiveCount);

      for (let i = 0; i < effectiveCount; i++) {
        const px = (rng() - 0.5) * 6;
        const py = (rng() - 0.5) * 6;
        const pz = (rng() - 0.5) * 4;

        positionsArr[i * 3] = px;
        positionsArr[i * 3 + 1] = py;
        positionsArr[i * 3 + 2] = pz;

        sizesArr[i] = 0.03 + rng() * 0.04;
        const hueOffset = (rng() - 0.5) * 30;

        aAlphaArr[i] = 1.0;

        storedParticles.push({
          x: px,
          y: py,
          z: pz,
          vx: 0,
          vy: 0,
          vz: 0,
          size: sizesArr[i],
          hueOffset,
          alpha: 1,
          age: FADE_FRAMES, // start fully visible
        });

        aRandomArr[i * 3] = rng();
        aRandomArr[i * 3 + 1] = rng();
        aRandomArr[i * 3 + 2] = rng();
      }

      // Vibrant spatial gradient vertex colors
      const gradient = createSpatialGradient(params.paletteHue, params.paletteSaturation, seed, { mode: 'vibrant', familyHint: 'particle' });
      const vertexColors = computeVertexColors(positionsArr, gradient, { axis: 'x' });

      geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positionsArr, 3));
      geometry.setAttribute('size', new THREE.BufferAttribute(sizesArr, 1));
      geometry.setAttribute('aRandom', new THREE.BufferAttribute(aRandomArr, 3));
      geometry.setAttribute('aVertexColor', new THREE.BufferAttribute(vertexColors, 3));
      geometry.setAttribute('aAlpha', new THREE.BufferAttribute(aAlphaArr, 1));

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
        uHasSizeAttr: { value: 1.0 },
        uHasVertexColor: { value: 1.0 },
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
      const delta = frame.delta ?? 16;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      // CPU advection: bass drives field strength
      advectParticles(delta, bassEnergy, elapsed);

      // Upload updated positions and alpha to GPU
      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const alphaAttr = geometry.getAttribute('aAlpha') as THREE.BufferAttribute;
      const posArr = posAttr.array as Float32Array;
      const alphaArr = alphaAttr.array as Float32Array;

      for (let i = 0; i < storedParticles.length; i++) {
        const p = storedParticles[i];
        posArr[i * 3] = p.x;
        posArr[i * 3 + 1] = p.y;
        posArr[i * 3 + 2] = p.z;
        alphaArr[i] = p.alpha;
      }
      posAttr.needsUpdate = true;
      alphaAttr.needsUpdate = true;

      // Update GPU uniforms (treble micro-detail only — bass is handled by CPU)
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
      u.uDispersion.value = frame.params.dispersion ?? 0.0;
      u.uMidEnergy.value = frame.params.midEnergy;

      const breathScale = 1
        + Math.sin(elapsed * 0.0004) * 0.08 * motionAmplitude
        + Math.sin(elapsed * 0.00015) * 0.05 * motionAmplitude;
      u.uBreathScale.value = breathScale;

      // DoF focus distance modulation
      const baseFocus = 5.0;
      const focusDrift = Math.sin(elapsed * 0.0002) * 0.5;
      u.uFocusDistance.value = baseFocus + focusDrift;

      // Multi-axis rotation
      const yDrift = Math.sin(elapsed / 22000 * Math.PI * 2) * 0.15 * motionAmplitude;
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
      sceneRef = null;
      curlLut = null;
      attractors = [];
    },
  };
}

export function getParticleCount(field: ParticleField): number {
  return field.particleCount;
}

export function getParticlePositions(
  field: ParticleField,
): Array<{ x: number; y: number; z: number }> {
  return field.particles.map((p) => ({ x: p.x, y: p.y, z: p.z }));
}

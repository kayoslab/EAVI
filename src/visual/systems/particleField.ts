import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';

const DEFAULT_MAX_PARTICLES = 600;

export interface ParticleFieldConfig {
  maxParticles?: number;
  enableSparkle?: boolean;
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
  readonly particles: Particle[];
  cleanup(): void;
}

export function createParticleField(config?: ParticleFieldConfig): ParticleField {
  const maxParticles = config?.maxParticles ?? DEFAULT_MAX_PARTICLES;
  const enableSparkle = config?.enableSparkle ?? true;
  let particles: Particle[] = [];

  let pointsMesh: THREE.Points | null = null;
  let geometry: THREE.BufferGeometry | null = null;
  let material: THREE.PointsMaterial | null = null;
  let sceneRef: Scene | null = null;

  // Store base positions for displacement calculations
  let basePositions: Float32Array | null = null;

  return {
    get particles() {
      return particles;
    },

    init(
      scene: Scene,
      seed: string,
      params: VisualParams,
    ): void {
      const rng = createPRNG(seed);
      const baseCount = Math.floor(params.density * maxParticles);
      const effectiveCount = Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4));
      particles = [];

      const sizeRange = 1 + params.structureComplexity * 2;

      for (let i = 0; i < effectiveCount; i++) {
        particles.push({
          x: rng(),
          y: rng(),
          vx: (rng() - 0.5) * 0.001,
          vy: (rng() - 0.5) * 0.001,
          size: 1 + rng() * sizeRange,
          hueOffset: (rng() - 0.5) * 30,
        });
      }

      // Create Three.js Points mesh
      geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(effectiveCount * 3);
      const colors = new Float32Array(effectiveCount * 3);
      basePositions = new Float32Array(effectiveCount * 3);

      const color = new THREE.Color();
      for (let i = 0; i < effectiveCount; i++) {
        const p = particles[i];
        // Map 0-1 particle coords to 3D space centered at origin
        const px = (p.x - 0.5) * 6;
        const py = (p.y - 0.5) * 6;
        const pz = (rng() - 0.5) * 2;
        positions[i * 3] = px;
        positions[i * 3 + 1] = py;
        positions[i * 3 + 2] = pz;
        basePositions[i * 3] = px;
        basePositions[i * 3 + 1] = py;
        basePositions[i * 3 + 2] = pz;

        // Set initial colors from paletteHue
        const hue = ((params.paletteHue + p.hueOffset) % 360 + 360) % 360;
        color.setHSL(hue / 360, params.paletteSaturation, 0.6);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }

      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

      material = new THREE.PointsMaterial({
        size: 0.05 * (1 + params.structureComplexity),
        vertexColors: true,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.9,
      });

      pointsMesh = new THREE.Points(geometry, material);
      scene.add(pointsMesh);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!geometry || !pointsMesh || !basePositions) return;

      const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
      const colorAttr = geometry.getAttribute('color') as THREE.BufferAttribute;
      const positions = posAttr.array as Float32Array;
      const colors = colorAttr.array as Float32Array;

      const { bassEnergy, trebleEnergy, pointerDisturbance, motionAmplitude, paletteHue, paletteSaturation } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = (frame.pointerX ?? 0.5) - 0.5;
      const pointerY = (frame.pointerY ?? 0.5) - 0.5;

      const color = new THREE.Color();

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const i3 = i * 3;

        const bx = basePositions[i3];
        const by = basePositions[i3 + 1];
        const bz = basePositions[i3 + 2];

        // Bass-driven macro drift
        const bassDrift = bassEnergy * motionAmplitude * 0.3;
        const driftX = Math.sin(elapsed * 0.0005 + i * 0.1) * bassDrift;
        const driftY = Math.cos(elapsed * 0.0004 + i * 0.13) * bassDrift;

        // Treble-driven jitter
        const trebleJitter = trebleEnergy * motionAmplitude * 0.15;
        const jitterX = (Math.sin(elapsed * 0.01 + i * 7.3) * 2 - 1) * trebleJitter;
        const jitterY = (Math.cos(elapsed * 0.013 + i * 5.7) * 2 - 1) * trebleJitter;
        const jitterZ = (Math.sin(elapsed * 0.009 + i * 3.1) * 2 - 1) * trebleJitter;

        // Pointer disturbance — particles near pointer displace more
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

        // Time-based gentle motion
        const timeMotion = motionAmplitude * 0.05;
        const timeX = Math.sin(elapsed * 0.0003 + i * 0.7) * timeMotion;
        const timeY = Math.cos(elapsed * 0.0002 + i * 0.9) * timeMotion;

        positions[i3] = bx + driftX + jitterX + ptrOffsetX + timeX;
        positions[i3 + 1] = by + driftY + jitterY + ptrOffsetY + timeY;
        positions[i3 + 2] = bz + jitterZ;

        // Update colors from paletteHue
        const hue = ((paletteHue + p.hueOffset) % 360 + 360) % 360;
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
    },
  };
}

export function getParticleCount(field: ParticleField): number {
  return field.particles.length;
}

export function getParticlePositions(
  field: ParticleField,
): Array<{ x: number; y: number }> {
  return field.particles.map((p) => ({ x: p.x, y: p.y }));
}

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
}

export function createParticleField(config?: ParticleFieldConfig): ParticleField {
  const maxParticles = config?.maxParticles ?? DEFAULT_MAX_PARTICLES;
  const enableSparkle = config?.enableSparkle ?? true;
  let particles: Particle[] = [];

  return {
    get particles() {
      return particles;
    },

    init(
      _scene: Scene,
      seed: string,
      params: VisualParams,
    ): void {
      const rng = createPRNG(seed);
      const baseCount = Math.floor(params.density * maxParticles);
      const effectiveCount = Math.floor(baseCount * (0.6 + params.structureComplexity * 0.4));
      particles = [];

      // Higher structureComplexity = wider size distribution (more visual hierarchy)
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
    },

    // TODO: Port Canvas 2D draw calls to Three.js in future story
    draw(_scene: Scene, _frame: FrameState): void {
      // Canvas 2D rendering temporarily disabled — will be ported to Three.js
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

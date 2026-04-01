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
      _ctx: CanvasRenderingContext2D,
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

    draw(ctx: CanvasRenderingContext2D, frame: FrameState): void {
      const { params, width, height, delta } = frame;
      const speed = params.cadence * params.motionAmplitude * delta * 0.06;
      const bassBoost = 1 + params.bassEnergy * 2;
      const shimmer = 1 + params.trebleEnergy * 0.5;

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.x += p.vx * speed * bassBoost * width;
        p.y += p.vy * speed * bassBoost * height;

        // Pointer disturbance: push particles radially away from pointer position
        if (params.pointerDisturbance > 0) {
          const px = frame.pointerX ?? 0.5;
          const py = frame.pointerY ?? 0.5;
          const pdx = p.x - px;
          const pdy = p.y - py;
          const distSq = pdx * pdx + pdy * pdy;
          // Inverse-distance influence: closer particles are pushed more
          const influence = 1 / (1 + distSq * 50);
          const pushStrength = params.pointerDisturbance * 0.002 * delta * influence;
          // Normalize direction so push magnitude depends only on influence, not distance
          if (distSq > 0.0001) {
            const dist = Math.sqrt(distSq);
            p.x += (pdx / dist) * pushStrength;
            p.y += (pdy / dist) * pushStrength;
          } else {
            p.x += (p.vx > 0 ? 1 : -1) * pushStrength;
            p.y += (p.vy > 0 ? 1 : -1) * pushStrength;
          }
        }

        // Toroidal wrapping (work in 0-width/height space)
        if (p.x < 0) p.x += 1;
        if (p.x > 1) p.x -= 1;
        if (p.y < 0) p.y += 1;
        if (p.y > 1) p.y -= 1;

        // Clamp to ensure bounds
        p.x = Math.max(0, Math.min(1, p.x));
        p.y = Math.max(0, Math.min(1, p.y));

        const hue = (params.paletteHue + p.hueOffset * (0.5 + params.structureComplexity * 0.5) + 360) % 360;
        const sat = Math.round(params.paletteSaturation * 100);
        const light = Math.round(50 + params.trebleEnergy * 30);

        let size: number;
        let jitterX = 0;
        let jitterY = 0;

        if (enableSparkle) {
          // Per-particle sparkle shimmer: staggered size pulsing driven by treble
          const sparklePhase =
            (Math.sin(frame.time * 0.005 + p.hueOffset) + 1) * 0.5;
          size = p.size * shimmer * (1 + sparklePhase * params.trebleEnergy * 0.5);

          // Micro-jitter on render position only (does not accumulate in stored position)
          jitterX =
            Math.sin(frame.time * 0.01 + i) * params.trebleEnergy * 0.003 * width;
          jitterY =
            Math.cos(frame.time * 0.01 + i) * params.trebleEnergy * 0.003 * height;
        } else {
          size = p.size * shimmer;
        }

        // Alpha variation: particles become more vivid on treble hits
        const alpha = 0.6 + params.trebleEnergy * 0.4;

        ctx.fillStyle = `hsla(${Math.round(hue)}, ${sat}%, ${light}%, ${alpha})`;

        if (params.curveSoftness >= 0.5) {
          const radius = size / 2;
          ctx.beginPath();
          ctx.arc(
            p.x * width + jitterX,
            p.y * height + jitterY,
            radius,
            0,
            Math.PI * 2,
          );
          ctx.fill();
        } else {
          ctx.fillRect(
            p.x * width - size / 2 + jitterX,
            p.y * height - size / 2 + jitterY,
            size,
            size,
          );
        }
      }
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

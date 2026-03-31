import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';

const MAX_PARTICLES = 600;

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

export function createParticleField(): ParticleField {
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
      const count = Math.floor(params.density * MAX_PARTICLES);
      particles = [];

      for (let i = 0; i < count; i++) {
        particles.push({
          x: rng(),
          y: rng(),
          vx: (rng() - 0.5) * 0.001,
          vy: (rng() - 0.5) * 0.001,
          size: 1 + rng() * 2,
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

        // Pointer disturbance: push particles away from center based on disturbance
        p.x += (p.vx > 0 ? 1 : -1) * params.pointerDisturbance * 0.002 * delta;
        p.y += (p.vy > 0 ? 1 : -1) * params.pointerDisturbance * 0.002 * delta;

        // Toroidal wrapping (work in 0-width/height space)
        if (p.x < 0) p.x += 1;
        if (p.x > 1) p.x -= 1;
        if (p.y < 0) p.y += 1;
        if (p.y > 1) p.y -= 1;

        // Clamp to ensure bounds
        p.x = Math.max(0, Math.min(1, p.x));
        p.y = Math.max(0, Math.min(1, p.y));

        const hue = (params.paletteHue + p.hueOffset + 360) % 360;
        const sat = Math.round(params.paletteSaturation * 100);
        const light = Math.round(50 + params.trebleEnergy * 30);

        // Per-particle sparkle shimmer: staggered size pulsing driven by treble
        const sparklePhase =
          (Math.sin(frame.time * 0.005 + p.hueOffset) + 1) * 0.5;
        const size = p.size * shimmer * (1 + sparklePhase * params.trebleEnergy * 0.5);

        // Alpha variation: particles become more vivid on treble hits
        const alpha = 0.6 + params.trebleEnergy * 0.4;

        ctx.fillStyle = `hsla(${Math.round(hue)}, ${sat}%, ${light}%, ${alpha})`;

        // Micro-jitter on render position only (does not accumulate in stored position)
        const jitterX =
          Math.sin(frame.time * 0.01 + i) * params.trebleEnergy * 0.003 * width;
        const jitterY =
          Math.cos(frame.time * 0.01 + i) * params.trebleEnergy * 0.003 * height;

        ctx.fillRect(
          p.x * width - size / 2 + jitterX,
          p.y * height - size / 2 + jitterY,
          size,
          size,
        );
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

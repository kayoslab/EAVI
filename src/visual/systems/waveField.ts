import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';

const DEFAULT_MAX_WAVES = 20;

export interface WaveFieldConfig {
  maxWaves?: number;
  enableShimmer?: boolean;
}

interface Wave {
  y: number;
  amplitude: number;
  frequency: number;
  phase: number;
  hueOffset: number;
}

export interface WaveField extends GeometrySystem {
  readonly waves: Wave[];
}

export function createWaveField(config?: WaveFieldConfig): WaveField {
  const maxWaves = config?.maxWaves ?? DEFAULT_MAX_WAVES;
  const enableShimmer = config?.enableShimmer ?? true;
  let waves: Wave[] = [];

  return {
    get waves() {
      return waves;
    },

    init(
      _ctx: CanvasRenderingContext2D,
      seed: string,
      params: VisualParams,
    ): void {
      const rng = createPRNG(seed);
      const baseCount = Math.floor(params.density * maxWaves);
      const effectiveCount = Math.max(1, Math.min(baseCount, maxWaves));
      waves = [];

      for (let i = 0; i < effectiveCount; i++) {
        waves.push({
          y: (i + 0.5) / effectiveCount,
          amplitude: 0.02 + rng() * 0.06,
          frequency: 1 + rng() * 3,
          phase: rng() * Math.PI * 2,
          hueOffset: (rng() - 0.5) * 40,
        });
      }
    },

    draw(ctx: CanvasRenderingContext2D, frame: FrameState): void {
      const { params, width, height } = frame;
      const time = frame.time * 0.001;
      const speed = params.cadence * params.motionAmplitude;
      const bassScale = 1 + params.bassEnergy * 3;
      const segments = Math.max(40, Math.floor(width / 10));

      for (let w = 0; w < waves.length; w++) {
        const wave = waves[w];
        const centerY = wave.y * height;
        const amp = wave.amplitude * height * bassScale;

        // Treble-driven line width and alpha
        const baseWidth = 1 + params.trebleEnergy * 2;
        let lineWidth = baseWidth;
        let alpha = 0.5 + params.trebleEnergy * 0.4;

        if (enableShimmer) {
          const shimmerPhase = Math.sin(time * 3 + wave.phase + w) * 0.5 + 0.5;
          lineWidth += shimmerPhase * params.trebleEnergy * 1.5;
          alpha += shimmerPhase * params.trebleEnergy * 0.1;
        }

        alpha = Math.min(alpha, 1);

        const hue = ((params.paletteHue + wave.hueOffset) % 360 + 360) % 360;
        const sat = Math.round(params.paletteSaturation * 100);
        const light = Math.round(45 + params.trebleEnergy * 25);

        ctx.strokeStyle = `hsla(${Math.round(hue)}, ${sat}%, ${light}%, ${alpha})`;
        ctx.lineWidth = lineWidth;

        ctx.beginPath();

        for (let i = 0; i <= segments; i++) {
          const t = i / segments;
          const x = t * width;

          // Base sine wave
          let y = centerY + Math.sin(
            t * wave.frequency * Math.PI * 2 + wave.phase + time * speed,
          ) * amp;

          // Pointer disturbance: warp wave near pointer
          if (params.pointerDisturbance > 0) {
            const px = (frame.pointerX ?? 0.5) * width;
            const py = (frame.pointerY ?? 0.5) * height;
            const dx = x - px;
            const dy = y - py;
            const distSq = dx * dx + dy * dy;
            const influence = 1 / (1 + distSq * 0.0001);
            const warpStrength = params.pointerDisturbance * 30 * influence;
            y += (dy > 0 ? 1 : -1) * warpStrength;
          }

          if (i === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }

        ctx.stroke();
      }
    },
  };
}

export function getWaveCount(field: WaveField): number {
  return field.waves.length;
}

export function getWavePositions(
  field: WaveField,
): Array<{ y: number; amplitude: number; frequency: number; phase: number }> {
  return field.waves.map((w) => ({
    y: w.y,
    amplitude: w.amplitude,
    frequency: w.frequency,
    phase: w.phase,
  }));
}

import type { Scene } from 'three';
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
  let waves: Wave[] = [];

  return {
    get waves() {
      return waves;
    },

    init(
      _scene: Scene,
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

    // TODO: Port Canvas 2D draw calls to Three.js in future story
    draw(_scene: Scene, _frame: FrameState): void {
      // Canvas 2D rendering temporarily disabled — will be ported to Three.js
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

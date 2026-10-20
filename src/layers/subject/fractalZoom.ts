import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import type { QualityTier } from '../../visual/quality';
import fractalShader from './fractal.wgsl';

export type FractalFamily = 'mandelbulb' | 'mandelbox' | 'julia' | 'apollonian' | 'sierpinski';
export const FRACTAL_FAMILIES: readonly FractalFamily[] = ['mandelbulb', 'mandelbox', 'julia', 'apollonian', 'sierpinski'];
const FAMILY_ID: Record<FractalFamily, number> = { mandelbulb: 0, mandelbox: 1, julia: 2, apollonian: 3, sierpinski: 4 };

export interface FractalZoomConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly family?: FractalFamily;
  readonly warm?: boolean;
}

/** Raymarched 3D fractal subject; the family is seeded and its parameters drift slowly. */
export function createFractalZoomLayer(gpu: Gpu, config: FractalZoomConfig): Layer {
  const rng = createPRNG(config.seed + ':fractal');
  const pool: FractalFamily[] = config.tier === 'high'
    ? [...FRACTAL_FAMILIES]
    : config.tier === 'medium' ? ['mandelbulb', 'julia', 'sierpinski', 'mandelbox'] : ['sierpinski', 'mandelbox'];
  const family = config.family ?? pool[Math.floor(rng() * pool.length) % pool.length];
  // Raymarched fractals are the most expensive layer: keep the budgets modest even at high tier.
  const iterations = { high: 8, medium: 6, low: 5 }[config.tier];
  const steps = { high: 72, medium: 56, low: 44 }[config.tier];
  const baseScale = { mandelbulb: 1.25, mandelbox: 1.1, julia: 1.3, apollonian: 1.1, sierpinski: 1.15 }[family];
  const spin = (0.02 + rng() * 0.03) * (rng() < 0.5 ? -1 : 1);
  const warm = config.warm ?? rng() < 0.5;
  // Seeded Julia constant on a safe ring; it drifts on a slow circle so the set keeps morphing.
  const juliaAngle = rng() * Math.PI * 2;
  const juliaBase = [-0.2 + rng() * 0.3, 0.55 + rng() * 0.25, 0.1 + rng() * 0.2, (rng() - 0.5) * 0.2];
  const breathPhase = rng() * Math.PI * 2;

  const basePower = { mandelbulb: 8, mandelbox: 2.2, julia: 0, apollonian: 1.1, sierpinski: 0 }[family];

  const fractal: Draw = draw(gpu, {
    label: `eavi-fractal-${family}`,
    shader: fractalShader,
    vertices: 3,
    cull: 'none',
    depth: { write: true, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      params: {
        juliaC: juliaBase, family: FAMILY_ID[family], iterations, steps, pad0: 0,
        scale: baseScale, power: basePower, bass: 0, treble: 0, hue: 200, saturation: 0.6,
        fogDensity: 0.1, rotation: 0, opacity: 0, glow: 1, warm: warm ? 1 : 0, pad1: 0,
      },
    },
  });

  return {
    name: `fractal:${family}`,
    pointCount: 0,
    async compile(scene: Target) {
      await fractal.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const t = frame.timeSec;
      const slow = Math.sin(t * 0.03 + breathPhase);
      // Parameter drift per family: a breath, never a jump.
      let power = basePower;
      if (family === 'mandelbulb') power = 8 + slow * 1.2 + params.bassEnergy * 0.4;
      if (family === 'mandelbox') power = 2.2 + slow * 0.35 + params.bassEnergy * 0.1;
      if (family === 'apollonian') power = 1.1 + slow * 0.12;
      const ja = juliaAngle + t * 0.015;
      const juliaC = [
        juliaBase[0] + Math.cos(ja) * 0.12 + params.bassEnergy * 0.03,
        juliaBase[1] + Math.sin(ja) * 0.12,
        juliaBase[2] + Math.sin(ja * 0.7) * 0.08,
        juliaBase[3] + Math.cos(ja * 0.5) * 0.05,
      ];
      fractal.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: t,
        },
        params: {
          juliaC,
          power,
          scale: baseScale * params.radialScale * (1 + params.bassEnergy * 0.04 + slow * 0.06),
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          hue: params.paletteHue,
          saturation: params.paletteSaturation,
          rotation: t * spin * (0.3 + 0.7 * params.motionAmplitude) * params.cadence,
          opacity: frame.opacity,
          fogDensity: 0.08 + params.midEnergy * 0.08,
          glow: 0.8 + params.trebleEnergy * 0.2,
        },
      });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(fractal);
    },
    resize() {},
    dispose() {
      fractal.dispose();
    },
  };
}

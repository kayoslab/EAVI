import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import mengerShader from './menger.wgsl';

export interface MengerConfig {
  readonly seed: string;
  readonly iterations: number;
  readonly scale?: number;
}

/** Raymarched Menger sponge subject. Full-screen draw with depth write. */
export function createMengerLayer(gpu: Gpu, config: MengerConfig): Layer {
  const rng = createPRNG(config.seed + ':menger');
  const baseScale = config.scale ?? 1.1;
  const spin = (0.03 + rng() * 0.04) * (rng() < 0.5 ? -1 : 1);
  const iterations = Math.max(1, Math.min(5, Math.floor(config.iterations)));

  const sponge: Draw = draw(gpu, {
    label: 'eavi-menger',
    shader: mengerShader,
    vertices: 3,
    cull: 'none',
    depth: { write: true, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      params: {
        iterations, scale: baseScale, bass: 0, treble: 0, hue: 200, saturation: 0.6,
        fogDensity: 0.12, rotation: 0, opacity: 0, glow: 1, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: 'menger',
    pointCount: 0,
    async compile(scene: Target) {
      await sponge.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      sponge.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        params: {
          scale: baseScale * (1 + params.bassEnergy * 0.05) * params.radialScale,
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          hue: params.paletteHue,
          saturation: params.paletteSaturation,
          rotation: frame.timeSec * spin * (0.3 + 0.7 * params.motionAmplitude) * params.cadence,
          opacity: frame.opacity,
          fogDensity: 0.08 + params.midEnergy * 0.08,
          glow: 0.9 + params.trebleEnergy * 0.3,
        },
      });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(sponge);
    },
    resize() {},
    dispose() {
      sponge.dispose();
    },
  };
}

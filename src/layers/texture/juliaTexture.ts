import { compute, texture, type Compute, type Frame, type Gpu, type Texture } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import juliaShader from './julia-compute.wgsl';

export interface JuliaTextureLayer extends Layer {
  readonly texture: Texture;
}

/** Compute-only layer: an endlessly morphing Julia set in a texture for other layers to wear. */
export function createJuliaTextureLayer(gpu: Gpu, config: { seed: string; width?: number; height?: number }): JuliaTextureLayer {
  const width = config.width ?? 512;
  const height = config.height ?? 256;
  const rng = createPRNG(config.seed + ':julia');
  const tex = texture(gpu, { kind: '2d', size: [width, height], format: 'rgba16float', usage: ['storage_binding', 'texture_binding'], label: 'eavi-julia' });
  const angle0 = rng() * Math.PI * 2;
  const radius = 0.72 + rng() * 0.1;
  const pass: Compute = compute(gpu, juliaShader, {
    label: 'eavi-julia',
    set: { outTex: tex, params: { c: [0.3, 0.5], center: [0, 0], zoom: 1, hue: 200, iterations: 96, width, height, pad0: 0, pad1: 0, pad2: 0 } },
  });
  return {
    name: 'julia-texture',
    pointCount: 0,
    texture: tex,
    async compile() {
      await pass.compile();
    },
    update(frame: LayerFrame) {
      const t = frame.timeSec;
      // The constant walks slowly around the main cardioid's rim: always a rich set, always moving.
      const a = angle0 + t * 0.012 * frame.params.cadence;
      const c = [radius * Math.cos(a) * 0.5 - 0.25 + Math.cos(a * 2.3) * 0.02, radius * Math.sin(a) * 0.5 + Math.sin(a * 1.7) * 0.02];
      pass.set({
        params: {
          c, zoom: 1.1 + Math.sin(t * 0.02) * 0.25 + frame.params.bassEnergy * 0.08, hue: frame.params.paletteHue,
          center: [Math.sin(t * 0.007) * 0.2, Math.cos(t * 0.009) * 0.15],
        },
      });
    },
    encodeCompute(frame: Frame) {
      frame.computePass((p) => p.dispatch(pass, Math.ceil(width / 16), Math.ceil(height / 16)));
    },
    encodeDraw() {},
    resize() {},
    dispose() {
      pass.dispose();
      tex.dispose();
    },
  };
}

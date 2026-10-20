import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import type { QualityTier } from '../../visual/quality';
import latticeShader from './lattice-lines.wgsl';

export interface WireCathedralConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly dpr?: number;
}

/** Endless lattice of tall wire cells around the camera with a slow twist along the travel axis. */
export function createWireCathedralLayer(gpu: Gpu, config: WireCathedralConfig): Layer {
  const rng = createPRNG(config.seed + ':cathedral');
  const half = config.tier === 'high' ? 6 : config.tier === 'medium' ? 5 : 4;
  const halfY = config.tier === 'high' ? 3 : 2;
  const cell: [number, number, number] = [3.0 + rng() * 1.0, 4.2 + rng() * 1.6, 3.0 + rng() * 1.0];
  const twistRate = (0.01 + rng() * 0.02) * (rng() < 0.5 ? -1 : 1);
  const nx = half * 2 + 1;
  const ny = halfY * 2 + 1;
  const perScale = nx * ny * nx * 3;
  const instances = perScale * 2;
  const thickness = 1.3 * Math.max(1, Math.min(2, config.dpr ?? 1));
  let scroll = rng() * 20;

  const lines: Draw = draw(gpu, {
    label: 'eavi-cathedral',
    shader: latticeShader,
    vertices: 6,
    instances,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      lattice: {
        cell, scroll: 0, resolution: [1, 1], half, halfY, thickness, twist: 0, hue: 200, saturation: 0.7,
        brightness: 0.6, treble: 0, fogDensity: 0.06, opacity: 0, fineMix: 0.18, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: 'cathedral',
    pointCount: instances,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      scroll += frame.deltaSec * (0.2 + params.cadence * 0.3) * (1 + params.bassEnergy * 0.3) * params.motionAmplitude;
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        lattice: {
          scroll,
          resolution: [frame.resolution[0], frame.resolution[1]],
          twist: twistRate * (0.3 + 0.7 * params.motionAmplitude) * (1 + Math.sin(frame.timeSec * 0.05) * 0.5),
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: 0.42 + params.bassEnergy * 0.2,
          treble: params.trebleEnergy,
          fogDensity: 0.05 + params.midEnergy * 0.04,
          opacity: frame.opacity,
          fineMix: 0.15 + frame.build * 0.25,
        },
      });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(lines);
    },
    resize() {},
    dispose() {
      lines.dispose();
    },
  };
}

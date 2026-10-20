import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import harmoShader from './harmonograph.wgsl';

export interface HarmonographConfig {
  readonly seed: string;
  readonly segments?: number;
  readonly thickness?: number;
}

/** Damped Lissajous trace drawn as a continuous glowing ribbon; frequencies drift with the music. */
export function createHarmonographLayer(gpu: Gpu, config: HarmonographConfig): Layer {
  const rng = createPRNG(config.seed + ':harmonograph');
  const count = Math.max(256, Math.min(8192, Math.floor(config.segments ?? 4096)));
  const thickness = config.thickness ?? 1.6;
  // Near-rational ratios give almost-closed figures that slowly precess.
  const ratios = [[2, 3, 5], [3, 4, 7], [3, 5, 2], [5, 6, 4], [2, 5, 3]][Math.floor(rng() * 5) % 5];
  const detune = () => 1 + (rng() - 0.5) * 0.02;
  const freq = [ratios[0] * detune(), ratios[1] * detune(), ratios[2] * detune(), (ratios[0] + ratios[1]) * detune()];
  const phase = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);
  const damping = 0.006 + rng() * 0.012;
  const span = 60 + rng() * 40;
  const tiltSpeed = [0.04 + rng() * 0.05, 0.05 + rng() * 0.06].map((v) => (rng() < 0.5 ? -v : v));

  const lines: Draw = draw(gpu, {
    label: 'eavi-harmonograph',
    shader: harmoShader,
    vertices: 6,
    instances: count - 1,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      harmo: {
        freq, phase, resolution: [1, 1], count, scale: 1.7, damping, span, thickness,
        tiltX: 0, tiltY: 0, hue: 200, saturation: 0.7, brightness: 0.5, treble: 0, opacity: 0, time: 0, pad0: 0,
      },
    },
  });

  return {
    name: 'harmonograph',
    pointCount: count,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const t = frame.timeSec * (0.3 + 0.7 * params.motionAmplitude);
      // Phases precess slowly; bass pushes the secondary oscillator's phase for a gentle morph.
      const slow = frame.timeSec * 0.02 * params.cadence;
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        harmo: {
          phase: [phase[0] + slow, phase[1] + slow * 0.7, phase[2] + slow * 1.3, phase[3] + slow * 0.5 + params.bassEnergy * 0.4],
          resolution: [frame.resolution[0], frame.resolution[1]],
          scale: 1.7 * params.radialScale * (1 + params.bassEnergy * 0.06),
          tiltX: Math.sin(t * tiltSpeed[0]) * 0.5,
          tiltY: t * tiltSpeed[1],
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.2),
          brightness: 0.45 + params.bassEnergy * 0.2,
          treble: params.trebleEnergy,
          opacity: frame.opacity,
          time: frame.timeSec,
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

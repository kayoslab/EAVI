import { draw, storage, type Draw, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import scopeShader from './scope-lines.wgsl';

export interface VectorScopeConfig {
  readonly seed: string;
  readonly samples?: number;
  readonly radius?: number;
  readonly thickness?: number;
}

/** Oscilloscope ring: the live waveform as a glowing closed trace in 3D. */
export function createVectorScopeLayer(gpu: Gpu, config: VectorScopeConfig): Layer {
  const rng = createPRNG(config.seed + ':scope');
  const count = Math.max(64, Math.min(2048, Math.floor(config.samples ?? 1024)));
  const radius = config.radius ?? 1.4;
  const thickness = config.thickness ?? 1.6;
  const tiltSpeed = [0.05 + rng() * 0.06, 0.08 + rng() * 0.08].map((v) => (rng() < 0.5 ? -v : v));
  const twistSpeed = 0.12 + rng() * 0.2;

  const values = new Float32Array(count);
  const buffer: StorageBuffer = storage(gpu, values.byteLength, 'read');
  buffer.write(values);

  const lines: Draw = draw(gpu, {
    label: 'eavi-scope',
    shader: scopeShader,
    vertices: 6,
    instances: count,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      samples: buffer,
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      scope: {
        resolution: [1, 1], count, radius, gain: 0.6, thickness, tiltX: 0, tiltY: 0, twist: 0,
        hue: 200, saturation: 0.7, brightness: 0.9, treble: 0, opacity: 0, time: 0, pad0: 0,
      },
    },
  });

  return {
    name: 'scope',
    pointCount: count,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera, waveform } = frame;
      if (waveform && waveform.length > 0) {
        const step = waveform.length / count;
        for (let i = 0; i < count; i++) values[i] = (waveform[Math.floor(i * step)] - 128) / 128;
      } else {
        // No analyser yet: a quiet synthetic tone so the ring still breathes.
        for (let i = 0; i < count; i++) values[i] = 0.25 * Math.sin((i / count) * Math.PI * 6 + frame.timeSec * 2);
      }
      buffer.write(values);
      const t = frame.timeSec * (0.3 + 0.7 * params.motionAmplitude);
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        scope: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          radius: radius * params.radialScale * (1 + params.bassEnergy * 0.1),
          gain: 0.5 + params.bassEnergy * 0.5,
          thickness: thickness * (1 + params.beatPulse * 0.2),
          tiltX: Math.sin(t * tiltSpeed[0]) * 0.6,
          tiltY: t * tiltSpeed[1],
          twist: frame.timeSec * twistSpeed,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.2),
          brightness: 0.8 + params.bassEnergy * 0.2,
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
      (buffer as { destroy?: () => void }).destroy?.();
    },
  };
}

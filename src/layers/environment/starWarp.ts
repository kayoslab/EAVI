import { compute, draw, storage, type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import simShader from './star-sim.wgsl';
import drawShader from './star-draw.wgsl';

const WORKGROUP = 64;

export interface StarWarpConfig {
  readonly seed: string;
  readonly count: number;
  readonly thickness?: number;
}

/** Hyperspace starfield: compute-driven streaks rushing past the camera. */
export function createStarWarpLayer(gpu: Gpu, config: StarWarpConfig): Layer {
  const count = Math.max(WORKGROUP, Math.floor(config.count));
  const rng = createPRNG(config.seed + ':starwarp');
  const radius = 6;
  const length = 40;
  const init = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    init[i * 4] = Math.cos(a) * r;
    init[i * 4 + 1] = Math.sin(a) * r;
    init[i * 4 + 2] = rng() * length;
    init[i * 4 + 3] = 0.4 + rng() * 0.6;
  }
  const stars: StorageBuffer = storage(gpu, init.byteLength, 'read-write');
  stars.write(init);
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;

  const sim: Compute = compute(gpu, simShader, {
    label: 'eavi-starwarp-sim',
    set: { stars, params: { dt: 0, speed: 6, radius, length, count, seed, pad0: 0, pad1: 0 } },
  });
  const streaks: Draw = draw(gpu, {
    label: 'eavi-starwarp-draw',
    shader: drawShader,
    vertices: 6,
    instances: count,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      stars,
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      warp: {
        resolution: [1, 1], streak: 0.3, thickness: config.thickness ?? 1.2, hue: 200, saturation: 0.6,
        brightness: 0.6, treble: 0, opacity: 0, fogDensity: 0.06, pad0: 0, pad1: 0,
      },
    },
  });
  let dispatches = 0;

  return {
    name: 'starwarp',
    pointCount: count,
    async compile(scene: Target) {
      await Promise.all([sim.compile(), streaks.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const speed = (1.6 + params.cadence * 2.4) * (1 + params.bassEnergy * 0.5) * params.motionAmplitude;
      sim.set({ params: { dt: Math.min(0.05, frame.deltaSec), speed } });
      dispatches = Math.ceil(count / WORKGROUP);
      const pixels = frame.resolution[0] * frame.resolution[1];
      const density = Math.max(0.03, Math.min(1, pixels / (count * 40)));
      streaks.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        warp: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          streak: 0.15 + speed * 0.08 + params.beatPulse * 0.12,
          hue: params.paletteHue,
          saturation: params.paletteSaturation,
          brightness: (0.45 + params.bassEnergy * 0.25) * density,
          treble: params.trebleEnergy,
          opacity: frame.opacity,
          fogDensity: 0.05 + params.midEnergy * 0.04,
        },
      });
    },
    encodeCompute(frame: Frame) {
      frame.computePass((pass) => pass.dispatch(sim, dispatches));
    },
    encodeDraw(pass: FramePass) {
      pass.draw(streaks);
    },
    resize() {},
    dispose() {
      streaks.dispose();
      sim.dispose();
      (stars as { destroy?: () => void }).destroy?.();
    },
  };
}

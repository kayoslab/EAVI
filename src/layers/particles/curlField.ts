import { compute, draw, storage, type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import simShader from './curl-sim.wgsl';
import drawShader from './attractor-draw.wgsl';

const WORKGROUP = 64;

export interface CurlFieldConfig {
  readonly seed: string;
  readonly count: number;
  readonly pointSize?: number;
}

/** Curl-noise particle field: coherent streaming ribbons, rendered with the shared point shader. */
export function createCurlFieldLayer(gpu: Gpu, config: CurlFieldConfig): Layer {
  const count = Math.max(WORKGROUP, Math.floor(config.count));
  const rng = createPRNG(config.seed + ':curl');
  const radius = 1.6;
  const init = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    init[i * 4] = (rng() * 2 - 1) * radius;
    init[i * 4 + 1] = (rng() * 2 - 1) * radius;
    init[i * 4 + 2] = (rng() * 2 - 1) * radius;
    init[i * 4 + 3] = 0.2 + rng() * 3.5;
  }
  const particles: StorageBuffer = storage(gpu, init.byteLength, 'read-write');
  particles.write(init);
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;
  const noiseScale = 0.9 + rng() * 0.6;

  const sim: Compute = compute(gpu, simShader, {
    label: 'eavi-curl-sim',
    set: { particles, params: { dt: 0, time: 0, bass: 0, treble: 0, scale: noiseScale, speed: 0.5, radius, pad0: 0, count, seed, pad1: 0, pad2: 0 } },
  });
  const points: Draw = draw(gpu, {
    label: 'eavi-curl-draw',
    shader: drawShader,
    vertices: 6,
    instances: count,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      particles,
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      view: {
        center: [0, 0, 0], worldScale: 1, resolution: [1, 1],
        pointSize: config.pointSize ?? 1.4, hue: 200, saturation: 0.7, brightness: 0.6, treble: 0, opacity: 0,
      },
    },
  });
  let dispatches = 0;

  return {
    name: 'curl',
    pointCount: count,
    async compile(scene: Target) {
      await Promise.all([sim.compile(), points.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      sim.set({
        params: {
          dt: Math.min(0.05, frame.deltaSec) * params.motionAmplitude,
          time: frame.timeSec,
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          speed: 0.35 + params.cadence * 0.35,
        },
      });
      dispatches = Math.ceil(count / WORKGROUP);
      const pixels = frame.resolution[0] * frame.resolution[1];
      const density = Math.max(0.02, Math.min(1, pixels / (count * 24)));
      points.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        view: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          worldScale: params.radialScale,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: (0.6 + params.bassEnergy * 0.3) * density,
          treble: params.trebleEnergy,
          opacity: frame.opacity,
        },
      });
    },
    encodeCompute(frame: Frame) {
      frame.computePass((pass) => pass.dispatch(sim, dispatches));
    },
    encodeDraw(pass: FramePass) {
      pass.draw(points);
    },
    resize() {},
    dispose() {
      points.dispose();
      sim.dispose();
      (particles as { destroy?: () => void }).destroy?.();
    },
  };
}

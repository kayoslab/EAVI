import { compute, draw, storage, type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import simShader from './attractor-sim.wgsl';
import drawShader from './attractor-draw.wgsl';

const WORKGROUP = 64;

export interface AttractorConfig {
  readonly count: number;
  readonly seed: string;
  /** Base point size in device pixels. */
  readonly pointSize?: number;
}

/**
 * Strange-attractor particle layer: a compute pass integrates N points, a draw pass
 * renders them as additive discs tested (not written) against scene depth.
 */
export function createAttractorLayer(gpu: Gpu, config: AttractorConfig): Layer {
  const count = Math.max(WORKGROUP, Math.floor(config.count));
  const rng = createPRNG(config.seed + ':attractor');

  // Seed every particle near the attractor with a staggered life so respawns never pulse.
  const initial = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    initial[i * 4] = (rng() * 2 - 1) * 18;
    initial[i * 4 + 1] = (rng() * 2 - 1) * 24;
    initial[i * 4 + 2] = 5 + rng() * 40;
    initial[i * 4 + 3] = 0.2 + rng() * 2.8;
  }
  const particles: StorageBuffer = storage(gpu, initial.byteLength, 'read-write');
  particles.write(initial);

  const seedU32 = Math.floor(rng() * 0xffffffff) >>> 0;

  const sim: Compute = compute(gpu, simShader, {
    label: 'eavi-attractor-sim',
    set: {
      particles,
      params: {
        dt: 0.004, time: 0, bass: 0, treble: 0,
        sigma: 10, rho: 28, beta: 8 / 3, respawnRadius: 6,
        count, seed: seedU32, pad0: 0, pad1: 0,
      },
    },
  });

  const points: Draw = draw(gpu, {
    label: 'eavi-attractor-draw',
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
        center: [0, 0, 25], worldScale: 0.085, resolution: [1, 1],
        pointSize: config.pointSize ?? 1.6, hue: 200, saturation: 0.7, brightness: 0.9, treble: 0, opacity: 0,
      },
    },
  });

  let dispatches = 0;

  return {
    name: 'attractor',
    pointCount: count,
    async compile(scene: Target) {
      await Promise.all([sim.compile(), points.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      // Lorenz needs a small, bounded step; speed scales with cadence and a little with bass.
      const dt = Math.min(0.05, Math.max(0.001, frame.deltaSec)) * 0.16 * (0.6 + params.cadence * 0.5) * (1 + params.bassEnergy * 0.3);
      sim.set({ params: { dt, time: frame.timeSec, bass: params.bassEnergy, treble: params.trebleEnergy } });
      dispatches = Math.ceil(count / WORKGROUP);
      // Additive density normalisation: many points per pixel must not pile up into white.
      const pixels = frame.resolution[0] * frame.resolution[1];
      const density = Math.max(0.02, Math.min(1, pixels / (count * 28)));
      points.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        view: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: (0.6 + params.bassEnergy * 0.3) * density,
          treble: params.trebleEnergy,
          opacity: frame.opacity,
          worldScale: 0.085 * params.radialScale,
        },
      });
    },
    encodeCompute(frame: Frame) {
      frame.computePass((pass) => pass.dispatch(sim, dispatches));
    },
    encodeDraw(pass: FramePass) {
      pass.draw(points);
    },
    resize() {
      // Resolution is passed per frame; nothing to reallocate.
    },
    dispose() {
      points.dispose();
      sim.dispose();
      (particles as { destroy?: () => void }).destroy?.();
    },
  };
}

import { compute, draw, storage, type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import simShader from './ifs-sim.wgsl';
import drawShader from './attractor-draw.wgsl';

const WORKGROUP = 64;
const MAX_MAPS = 8;

/** One affine map: 3×3 matrix rows with translation in the fourth component, plus weight and colour. */
export interface AffineMap {
  readonly rows: readonly [readonly [number, number, number, number], readonly [number, number, number, number], readonly [number, number, number, number]];
  readonly weight: number;
  readonly colour: number;
}

export type IfsSystem = readonly AffineMap[];

function scaleTo(s: number, target: [number, number, number], colour: number, weight = 1): AffineMap {
  return { rows: [[s, 0, 0, target[0] * (1 - s)], [0, s, 0, target[1] * (1 - s)], [0, 0, s, target[2] * (1 - s)]], weight, colour };
}

/** Sierpinski tetrahedron: four half-scale contractions toward the vertices. */
export function sierpinskiSystem(): IfsSystem {
  const v: [number, number, number][] = [[1, 1, 1], [-1, -1, 1], [-1, 1, -1], [1, -1, -1]];
  return v.map((t, i) => scaleTo(0.5, t, i / 3));
}

/** Cantor dust on the cube corners: eight third-scale contractions. */
export function cantorDustSystem(): IfsSystem {
  const out: AffineMap[] = [];
  for (let i = 0; i < 8; i++) out.push(scaleTo(1 / 3, [(i & 1 ? 1 : -1), (i & 2 ? 1 : -1), (i & 4 ? 1 : -1)], i / 7));
  return out;
}

/** A 3D fern: a stem map plus three leaflet maps with rotations about different axes. */
export function fernSystem(): IfsSystem {
  const rot = (a: number, s: number, axis: 0 | 1 | 2): number[][] => {
    const c = Math.cos(a) * s;
    const sn = Math.sin(a) * s;
    if (axis === 2) return [[c, -sn, 0], [sn, c, 0], [0, 0, s]];
    if (axis === 0) return [[s, 0, 0], [0, c, -sn], [0, sn, c]];
    return [[c, 0, sn], [0, s, 0], [-sn, 0, c]];
  };
  const m = (r: number[][], t: [number, number, number], w: number, colour: number): AffineMap => ({
    rows: [[r[0][0], r[0][1], r[0][2], t[0]], [r[1][0], r[1][1], r[1][2], t[1]], [r[2][0], r[2][1], r[2][2], t[2]]], weight: w, colour,
  });
  return [
    m([[0, 0, 0], [0, 0.16, 0], [0, 0, 0.1]], [0, -1, 0], 0.02, 0.1),
    m(rot(-0.04, 0.85, 2), [0, 0.3, 0], 0.84, 0.5),
    m(rot(0.9, 0.3, 0), [0, 0.2, 0.1], 0.07, 0.8),
    m(rot(-0.9, 0.3, 1), [0, 0.1, -0.1], 0.07, 1.0),
  ];
}

/** Seeded random contractive system of 5–7 maps: always a new fractal, always bounded. */
export function randomSystem(seed: string): IfsSystem {
  const rng = createPRNG(seed + ':ifs');
  const count = 5 + Math.floor(rng() * 3);
  const out: AffineMap[] = [];
  for (let k = 0; k < count; k++) {
    const s = 0.35 + rng() * 0.3;
    const a = rng() * Math.PI * 2;
    const b = rng() * Math.PI * 2;
    const ca = Math.cos(a) * s, sa = Math.sin(a) * s, cb = Math.cos(b), sb = Math.sin(b);
    const t: [number, number, number] = [(rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6, (rng() - 0.5) * 1.6];
    out.push({
      rows: [[ca, -sa * cb, sa * sb, t[0]], [sa, ca * cb, -ca * sb, t[1]], [0, s * sb, s * cb, t[2]]],
      weight: 0.5 + rng(), colour: rng(),
    });
  }
  return out;
}

function packSystem(system: IfsSystem, prefix: 'a' | 'b'): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (let m = 0; m < MAX_MAPS; m++) {
    const map = system[m];
    out[`${prefix}${m * 4}`] = map ? [...map.rows[0]] : [0, 0, 0, 0];
    out[`${prefix}${m * 4 + 1}`] = map ? [...map.rows[1]] : [0, 0, 0, 0];
    out[`${prefix}${m * 4 + 2}`] = map ? [...map.rows[2]] : [0, 0, 0, 0];
    out[`${prefix}${m * 4 + 3}`] = map ? [map.weight, map.colour, 0, 0] : [0, 0, 0, 0];
  }
  return out;
}

export interface IfsCloudConfig {
  readonly seed: string;
  readonly count: number;
  readonly pointSize?: number;
}

export interface IfsCloudLayer extends Layer {
  /** Start a slow morph into another system over `seconds`. */
  morphTo(system: IfsSystem, seconds: number): void;
}

/** 3D IFS point cloud that slowly morphs between fractal systems. */
export function createIfsCloudLayer(gpu: Gpu, config: IfsCloudConfig): IfsCloudLayer {
  const count = Math.max(WORKGROUP, Math.floor(config.count));
  const rng = createPRNG(config.seed + ':ifscloud');
  const catalogue: (() => IfsSystem)[] = [sierpinskiSystem, cantorDustSystem, fernSystem, () => randomSystem(config.seed + ':r1'), () => randomSystem(config.seed + ':r2')];
  let current = catalogue[Math.floor(rng() * catalogue.length) % catalogue.length]();
  let next = current;
  let morphStart = -1;
  let morphSeconds = 1;
  let autoMorphAt = 25 + rng() * 20;

  const init = new Float32Array(count * 4);
  for (let i = 0; i < count; i++) {
    init[i * 4] = rng() - 0.5;
    init[i * 4 + 1] = rng() - 0.5;
    init[i * 4 + 2] = rng() - 0.5;
    init[i * 4 + 3] = rng();
  }
  const particles: StorageBuffer = storage(gpu, init.byteLength, 'read-write');
  particles.write(init);
  const seed = Math.floor(rng() * 0xffffffff) >>> 0;

  const sim: Compute = compute(gpu, simShader, {
    label: 'eavi-ifs-sim',
    set: {
      particles,
      params: { ...packSystem(current, 'a'), ...packSystem(next, 'b'), morph: 0, time: 0, bass: 0, jitter: 0.004, count, steps: 2, seed, pad0: 0 },
    },
  });
  const points: Draw = draw(gpu, {
    label: 'eavi-ifs-draw',
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
        center: [0, 0, 0], worldScale: 2.2, resolution: [1, 1],
        pointSize: config.pointSize ?? 1.6, hue: 200, saturation: 0.7, brightness: 0.6, treble: 0, opacity: 0,
      },
    },
  });
  let dispatches = 0;

  function morphTo(system: IfsSystem, seconds: number, now: number): void {
    current = next;
    next = system;
    sim.set({ params: { ...packSystem(current, 'a'), ...packSystem(next, 'b'), morph: 0 } });
    morphStart = now;
    morphSeconds = Math.max(1, seconds);
  }

  let lastTime = 0;
  return {
    name: 'ifs',
    pointCount: count,
    morphTo(system, seconds) {
      morphTo(system, seconds, lastTime);
    },
    async compile(scene: Target) {
      await Promise.all([sim.compile(), points.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      lastTime = frame.timeSec;
      // Autonomous slow morphs every half minute or so, in addition to Director-driven ones.
      if (frame.timeSec > autoMorphAt && morphStart < 0) {
        const pick = catalogue[Math.floor(rng() * catalogue.length) % catalogue.length]();
        morphTo(pick, 18, frame.timeSec);
        autoMorphAt = frame.timeSec + 30 + rng() * 25;
      }
      let morph = 0;
      if (morphStart >= 0) {
        const u = Math.min(1, (frame.timeSec - morphStart) / morphSeconds);
        morph = u * u * (3 - 2 * u);
        if (u >= 1) {
          current = next;
          sim.set({ params: { ...packSystem(current, 'a'), ...packSystem(next, 'b') } });
          morph = 0;
          morphStart = -1;
        }
      }
      sim.set({ params: { morph, time: frame.timeSec, bass: params.bassEnergy, jitter: 0.004 * params.motionAmplitude } });
      dispatches = Math.ceil(count / WORKGROUP);
      const pixels = frame.resolution[0] * frame.resolution[1];
      const density = Math.max(0.01, Math.min(1, pixels / (count * 90)));
      points.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        view: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          worldScale: 2.2 * params.radialScale,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: (0.5 + params.bassEnergy * 0.25) * density,
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

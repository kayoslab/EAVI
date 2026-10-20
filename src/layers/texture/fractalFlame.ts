import {
  compute, draw, sampler, storage, texture,
  type Compute, type Draw, type Frame, type FramePass, type Gpu, type StorageBuffer, type Target, type Texture,
} from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import clearShader from './flame-clear.wgsl';
import iterateShader from './flame-iterate.wgsl';
import resolveShader from './flame-resolve.wgsl';
import sheetShader from './flame-sheet.wgsl';

export interface FractalFlameConfig {
  readonly seed: string;
  readonly width?: number;
  readonly height?: number;
  readonly points?: number;
  readonly steps?: number;
}

interface FlameFunction {
  coef: [number, number, number, number];
  off: [number, number, number, number];
  col: [number, number, number, number];
}

export interface FractalFlameLayer extends Layer {
  /** The resolved flame image; other layers may sample it. */
  readonly texture: Texture;
  /** Re-seed the function system (sections, drops). */
  reseed(seed: string): void;
}

function makeFunctions(seed: string): FlameFunction[] {
  const rng = createPRNG(seed + ':flame-fns');
  const variations = [1, 2, 3, 5, 6, 7, 8, 9, 4, 0];
  const fns: FlameFunction[] = [];
  for (let i = 0; i < 4; i++) {
    const s = 0.45 + rng() * 0.45;
    const ang = rng() * Math.PI * 2;
    const skew = (rng() - 0.5) * 0.6;
    const a = Math.cos(ang) * s;
    const b = -Math.sin(ang) * s + skew;
    const c = Math.sin(ang) * s;
    const d = Math.cos(ang) * s;
    const e = (rng() - 0.5) * 1.2;
    const f = (rng() - 0.5) * 1.2;
    const variation = variations[Math.floor(rng() * variations.length) % variations.length];
    const weight = 0.4 + rng() * 0.8;
    fns.push({ coef: [a, b, c, d], off: [e, f, variation, weight], col: [0, 0, 0, i / 3] });
  }
  return fns;
}

/**
 * Fractal flame: GPU chaos game with atomics into a histogram, resolved into an HDR
 * texture every frame and shown on parallax billboards. WebGPU-only by nature.
 */
export function createFractalFlameLayer(gpu: Gpu, config: FractalFlameConfig): FractalFlameLayer {
  const width = Math.max(64, Math.floor(config.width ?? 512));
  const height = Math.max(64, Math.floor(config.height ?? 288));
  const count = Math.max(256, Math.floor(config.points ?? 65_536));
  const steps = Math.max(1, Math.floor(config.steps ?? 12));
  const texels = width * height;
  const rng = createPRNG(config.seed + ':flame');

  const pointsInit = new Float32Array(count * 4);
  const u32view = new Uint32Array(pointsInit.buffer);
  for (let i = 0; i < count; i++) {
    pointsInit[i * 4] = rng() * 2 - 1;
    pointsInit[i * 4 + 1] = rng() * 2 - 1;
    pointsInit[i * 4 + 2] = rng();
    u32view[i * 4 + 3] = Math.floor(rng() * 0xffffffff) >>> 0;
  }
  const points: StorageBuffer = storage(gpu, pointsInit.byteLength, 'read-write');
  points.write(pointsInit);
  // texels × (r, g, b, count) + 4 trailing u32 (frame max count and padding).
  const hist: StorageBuffer = storage(gpu, (texels * 4 + 4) * 4, 'read-write');

  const flameTexture = texture(gpu, {
    kind: '2d', size: [width, height], format: 'rgba16float',
    usage: ['storage_binding', 'texture_binding'], label: 'eavi-flame',
  });

  let fns = makeFunctions(config.seed);
  const fnUniforms = () => ({
    coef0: fns[0].coef, off0: fns[0].off, col0: fns[0].col,
    coef1: fns[1].coef, off1: fns[1].off, col1: fns[1].col,
    coef2: fns[2].coef, off2: fns[2].off, col2: fns[2].col,
    coef3: fns[3].coef, off3: fns[3].off, col3: fns[3].col,
  });

  const clear: Compute = compute(gpu, clearShader, {
    label: 'eavi-flame-clear',
    set: { hist, params: { texels, pad0: 0, pad1: 0, pad2: 0 } },
  });
  const iterate: Compute = compute(gpu, iterateShader, {
    label: 'eavi-flame-iterate',
    set: {
      points, hist,
      params: { width, height, count, steps, time: 0, bass: 0, treble: 0, zoom: 0.55, ...fnUniforms() },
    },
  });
  const expectedPerTexel = (count * steps) / texels;
  const resolve: Compute = compute(gpu, resolveShader, {
    label: 'eavi-flame-resolve',
    set: {
      hist, outTex: flameTexture,
      params: { width, height, scale: 4 / Math.max(1, expectedPerTexel), gamma: 0.8, hue: 200, brightness: 0.55, pad0: 0, pad1: 0 },
    },
  });

  const samp = sampler(gpu, { minFilter: 'linear', magFilter: 'linear', addressModeU: 'clamp-to-edge', addressModeV: 'clamp-to-edge' });
  const sheet: Draw = draw(gpu, {
    label: 'eavi-flame-sheet',
    shader: sheetShader,
    vertices: 6,
    instances: 2,
    cull: 'none',
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      sheet: { size: [2.2, 2.2 * (height / width)], depthStep: 1.2, opacity: 0, bass: 0, beat: 0, pad0: 0, pad1: 0 },
      flame: flameTexture,
      samp,
    },
  });

  return {
    name: 'flame',
    pointCount: count,
    texture: flameTexture,
    reseed(seed: string) {
      fns = makeFunctions(seed);
      iterate.set({ params: fnUniforms() });
    },
    async compile(scene: Target) {
      await Promise.all([clear.compile(), iterate.compile(), resolve.compile(), sheet.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      iterate.set({ params: { time: frame.timeSec, bass: params.bassEnergy, treble: params.trebleEnergy, zoom: 0.55 * params.radialScale } });
      resolve.set({ params: { hue: params.paletteHue, brightness: 0.5 + params.bassEnergy * 0.2 } });
      sheet.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        sheet: { opacity: frame.opacity, bass: params.bassEnergy, beat: params.beatPulse * 0.3 },
      });
    },
    encodeCompute(frame: Frame) {
      frame.computePass((pass) => {
        pass.dispatch(clear, Math.ceil((texels * 4 + 1) / 256));
        pass.dispatch(iterate, Math.ceil(count / 256));
        pass.dispatch(resolve, Math.ceil(width / 16), Math.ceil(height / 16));
      });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(sheet);
    },
    resize() {},
    dispose() {
      sheet.dispose();
      resolve.dispose();
      iterate.dispose();
      clear.dispose();
      (points as { destroy?: () => void }).destroy?.();
      (hist as { destroy?: () => void }).destroy?.();
      flameTexture.dispose();
    },
  };
}

import { compute, draw, texture, type Compute, type Draw, type Frame, type FramePass, type Gpu, type Target, type Texture } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import type { QualityTier } from '../../visual/quality';
import computeShader from './mandelbrot-compute.wgsl';
import sheetShader from './mandelbrot-sheet.wgsl';

export interface MandelbrotConfig {
  readonly seed: string;
  readonly tier: QualityTier;
}

/** Deep-zoom targets reachable in single precision: the set keeps reproducing itself on the way in. */
const TARGETS: readonly [number, number][] = [
  // Points with boundary on every side, so the frame stays full at every magnification
  // (valley and tail points leave half the frame to the set's interior).
  [-0.10109636, 0.95628651],   // Misiurewicz point on the top filaments
  [-0.235125, 0.827215],       // Misiurewicz point, dendrites
  [0.00164372, -0.82246763],   // the spiral
  [-1.2537, 0.0247],           // period-3 minibrot shore
  [-0.54, 0.6],                // dendrite field above the main cardioid
  [0.3245, 0.0486],            // elephant valley spirals
];

const START_HALF = 0.35;       // start tight on the boundary so the frame is full of filaments
const END_HALF = 6e-5;        // single-precision floor; the next zoom takes over before artefacts show
const HANDOVER_AT = 0.82;     // fraction of the run at which the next zoom starts fading in
const HANDOVER_SEC = 14;

interface Zoomer {
  readonly tex: Texture;
  readonly pass: Compute;
  readonly sheets: Draw;
  target: [number, number];
  /** ln of the current half-size; runs from ln(START) to ln(END). */
  logHalf: number;
  opacity: number;
  active: boolean;
}

/**
 * The Mandelbrot piece: a continuous zoom whose escape-time field is drawn as N terraced
 * contour sheets stacked in depth. Two zooms alternate with a long cross-dissolve, so the
 * dive never ends and never snaps back.
 */
export function createMandelbrotLayer(gpu: Gpu, config: MandelbrotConfig): Layer {
  const rng = createPRNG(config.seed + ':mandelbrot');
  const width = config.tier === 'high' ? 768 : 576;
  const height = Math.round(width * 9 / 16);
  const sheetCount = config.tier === 'high' ? 28 : 20;
  const maxIterCap = config.tier === 'high' ? 420 : 300;
  let nextTarget = Math.floor(rng() * TARGETS.length) % TARGETS.length;
  const hueOffset = rng() * 60;

  function makeZoomer(): Zoomer {
    const tex = texture(gpu, { kind: '2d', size: [width, height], format: 'r32float', usage: ['storage_binding', 'texture_binding'], label: 'eavi-mandelbrot' });
    const pass = compute(gpu, computeShader, {
      label: 'eavi-mandelbrot-compute',
      set: { outTex: tex, params: { center: [-0.5, 0], halfSize: [START_HALF * width / height, START_HALF], maxIter: 64, width, height, pad0: 0 } },
    });
    const sheets = draw(gpu, {
      label: 'eavi-mandelbrot-sheets',
      shader: sheetShader,
      vertices: 6,
      instances: sheetCount,
      cull: 'none',
      blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
      depth: { write: false, compare: 'less-equal' },
      set: {
        camera: {
          view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
          position: [0, 0, 0], time: 0,
        },
        sheet: {
          resolution: [1, 1], halfSize: 1.08, depthSpan: 2.4, sheets: sheetCount, width, height, pad0: 0,
          hue: 200, saturation: 0.7, brightness: 0.95, bass: 0, opacity: 0, bandWidth: 1, pad1: 0, pad2: 0,
        },
        field: tex,
      },
    });
    return { tex, pass, sheets, target: TARGETS[0], logHalf: Math.log(START_HALF), opacity: 0, active: false };
  }

  const zoomers: [Zoomer, Zoomer] = [makeZoomer(), makeZoomer()];
  function start(z: Zoomer): void {
    z.target = TARGETS[nextTarget];
    nextTarget = (nextTarget + 1 + Math.floor(rng() * (TARGETS.length - 1))) % TARGETS.length;
    z.logHalf = Math.log(START_HALF);
    z.active = true;
  }
  start(zoomers[0]);
  zoomers[0].opacity = 1;
  let handover: { from: Zoomer; to: Zoomer; start: number } | null = null;
  const logRange = Math.log(START_HALF) - Math.log(END_HALF);

  return {
    name: 'mandelbrot',
    pointCount: sheetCount,
    async compile(scene: Target) {
      await Promise.all(zoomers.flatMap((z) => [z.pass.compile(), z.sheets.compile(scene)]));
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const dt = Math.max(0, Math.min(0.1, frame.deltaSec));
      // Zoom speed: a slow, steady dive, a little faster on energetic tracks.
      const rate = (0.09 + params.cadence * 0.06) * (0.4 + 0.6 * params.motionAmplitude) * (1 + params.bassEnergy * 0.15);

      for (const z of zoomers) {
        if (!z.active) continue;
        z.logHalf -= rate * dt;
        const progress = (Math.log(START_HALF) - z.logHalf) / logRange;
        if (progress >= HANDOVER_AT && !handover) {
          const other = zoomers[0] === z ? zoomers[1] : zoomers[0];
          start(other);
          handover = { from: z, to: other, start: frame.timeSec };
        }
        if (z.logHalf <= Math.log(END_HALF)) {
          z.logHalf = Math.log(END_HALF); // hold at the floor until the handover finishes
        }
      }
      if (handover) {
        const u = Math.min(1, (frame.timeSec - handover.start) / HANDOVER_SEC);
        const k = u * u * (3 - 2 * u);
        handover.to.opacity = k;
        handover.from.opacity = 1 - k;
        if (u >= 1) {
          handover.from.active = false;
          handover = null;
        }
      }

      for (const z of zoomers) {
        if (!z.active && z.opacity <= 0) continue;
        const half = Math.exp(z.logHalf);
        const magnification = START_HALF / half;
        const maxIter = Math.min(maxIterCap, Math.round(70 + 45 * Math.log2(magnification)));
        z.pass.set({ params: { center: z.target, halfSize: [half * width / height, half], maxIter } });
        z.sheets.set({
          camera: {
            view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
            position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
          },
          sheet: {
            resolution: [frame.resolution[0], frame.resolution[1]],
            halfSize: 1.08,
            hue: params.paletteHue + hueOffset,
            saturation: Math.min(1, params.paletteSaturation + 0.2),
            brightness: 0.7 + params.trebleEnergy * 0.15,
            bass: params.bassEnergy,
            opacity: frame.opacity * z.opacity,
            // Bands widen as counts grow so the terraces stay readable at depth.
            bandWidth: Math.max(1, maxIter / 160),
          },
        });
      }
    },
    encodeCompute(frame: Frame) {
      frame.computePass((pass) => {
        for (const z of zoomers) {
          if (!z.active && z.opacity <= 0) continue;
          pass.dispatch(z.pass, Math.ceil(width / 16), Math.ceil(height / 16));
        }
      });
    },
    encodeDraw(pass: FramePass) {
      for (const z of zoomers) {
        if (z.opacity > 0.001) pass.draw(z.sheets);
      }
    },
    resize() {},
    dispose() {
      for (const z of zoomers) {
        z.sheets.dispose();
        z.pass.dispose();
        z.tex.dispose();
      }
    },
  };
}

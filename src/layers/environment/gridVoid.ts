import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import gridShader from './grid-lines.wgsl';

export interface GridVoidConfig {
  readonly seed: string;
  /** Lines per axis on each side of the origin; total lines = (2n+1) * 4. */
  readonly halfLines?: number;
  readonly cell?: number;
  readonly height?: number;
  readonly thickness?: number;
}

/** Tron grid: floor and ceiling of glowing lines, scrolling forward with the music. */
export function createGridVoidLayer(gpu: Gpu, config: GridVoidConfig): Layer {
  const rng = createPRNG(config.seed + ':gridvoid');
  const halfLines = Math.max(4, Math.floor(config.halfLines ?? 24));
  const cell = config.cell ?? 0.9 + rng() * 0.5;
  const height = config.height ?? 1.5 + rng() * 0.6;
  const thickness = config.thickness ?? 1.4;
  const linesPerAxis = halfLines * 2 + 1;
  const instances = linesPerAxis * 2 * 2;
  const extent = halfLines * cell;
  let scroll = 0;

  const lines: Draw = draw(gpu, {
    label: 'eavi-gridvoid',
    shader: gridShader,
    vertices: 6,
    instances,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      grid: {
        resolution: [1, 1], cell, halfLines, extent, height, scroll: 0, thickness,
        hue: 200, saturation: 0.8, brightness: 0.7, treble: 0, fogDensity: 0.1, opacity: 0, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: 'gridvoid',
    pointCount: instances,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      // Forward travel: cadence sets the base speed, bass pushes it.
      scroll += frame.deltaSec * (0.3 + params.cadence * 0.4) * (1 + params.bassEnergy * 0.4) * params.motionAmplitude;
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        grid: {
          resolution: [frame.resolution[0], frame.resolution[1]],
          scroll,
          thickness: thickness * (1 + params.beatPulse * 0.25),
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.2),
          brightness: 0.7 + params.bassEnergy * 0.3,
          treble: params.trebleEnergy,
          fogDensity: 0.06 + params.midEnergy * 0.05,
          opacity: frame.opacity,
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

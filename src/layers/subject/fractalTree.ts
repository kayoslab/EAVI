import { draw, storage, type Draw, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import { generateLSystemTree } from '../../visual/generators/lSystemTree';
import type { QualityTier } from '../../visual/quality';
import wireShader from './wire-lines.wgsl';

export interface FractalTreeConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly thickness?: number;
}

/** L-system tree as glowing wire branches; reuses the wireframe shader (bass ripple, treble shimmer). */
export function createFractalTreeLayer(gpu: Gpu, config: FractalTreeConfig): Layer {
  const rng = createPRNG(config.seed + ':tree');
  const depth = config.tier === 'high' ? 6 : config.tier === 'medium' ? 5 : 4;
  const tree = generateLSystemTree({
    seed: config.seed + ':tree',
    depth,
    maxVertices: config.tier === 'high' ? 40_000 : 16_000,
    maxEdges: config.tier === 'high' ? 24_000 : 10_000,
  });
  const edgeCount = tree.edgeCount;
  const scale = 1 / Math.max(1e-6, tree.normScale);

  const packed = new Float32Array(edgeCount * 8);
  for (let e = 0; e < edgeCount; e++) {
    for (let v = 0; v < 2; v++) {
      const src = (e * 2 + v) * 3;
      const dst = e * 8 + v * 4;
      // Centre the tree vertically so the trunk starts below the origin.
      packed[dst] = tree.edgePositions[src] * scale;
      packed[dst + 1] = tree.edgePositions[src + 1] * scale - 0.7;
      packed[dst + 2] = tree.edgePositions[src + 2] * scale;
      packed[dst + 3] = tree.edgeRandoms[src];
    }
  }
  const segments: StorageBuffer = storage(gpu, Math.max(32, packed.byteLength), 'read');
  if (packed.byteLength > 0) segments.write(packed);

  const thickness = config.thickness ?? 1.0;
  const spin = (0.03 + rng() * 0.04) * (rng() < 0.5 ? -1 : 1);

  const lines: Draw = draw(gpu, {
    label: 'eavi-tree',
    shader: wireShader,
    vertices: 6,
    instances: Math.max(1, edgeCount),
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      segments,
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      wire: {
        rotation: [0, 0, 0], scale: 0.8, resolution: [1, 1], thickness,
        bass: 0, treble: 0, beat: 0, hue: 200, saturation: 0.7, brightness: 0.8,
        fogDensity: 0.1, opacity: 0, ripple: 0.08, time: 0, reveal: 100, pad1: 0,
      },
    },
  });

  return {
    name: 'tree',
    pointCount: edgeCount * 2,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const t = frame.timeSec * (0.3 + 0.7 * params.motionAmplitude);
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        wire: {
          rotation: [0, t * spin, 0],
          scale: 0.8 * params.radialScale * (0.85 + frame.build * 0.15),
          resolution: [frame.resolution[0], frame.resolution[1]],
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          beat: params.beatPulse,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.1),
          brightness: 0.45 + params.bassEnergy * 0.25,
          fogDensity: 0.06 + params.midEnergy * 0.05,
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
      (segments as { destroy?: () => void }).destroy?.();
    },
  };
}

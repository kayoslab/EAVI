import { draw, storage, type Draw, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import type { QualityTier } from '../../visual/quality';
import { sierpinskiWire, mengerWire, hilbert3d, type LevelledEdges } from '../../visual/generators/fractalWire';
import wireShader from './wire-lines.wgsl';

export type FractalWireKind = 'sierpinski' | 'menger' | 'hilbert';

export interface FractalWireConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly kind?: FractalWireKind;
  readonly thickness?: number;
}

function hilbertEdges(order: number): LevelledEdges {
  const pts = hilbert3d(order);
  const count = pts.length / 3 - 1;
  const positions = new Float32Array(count * 6);
  const levels = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    positions.set(pts.subarray(i * 3, i * 3 + 6), i * 6);
    // Level runs along the curve so the path can be revealed as a growing trace.
    levels[i] = (i / count) * 20;
  }
  return { positions, levels, edgeCount: count, maxLevel: 20 };
}

/**
 * Recursive wire fractals (Sierpinski tetrahedron, Menger sponge) and the 3D Hilbert curve as
 * glowing lines. Recursion depth, or the curve's length, is revealed smoothly: it grows with
 * builds and over time, and recedes on breakdowns.
 */
export function createFractalWireLayer(gpu: Gpu, config: FractalWireConfig): Layer {
  const rng = createPRNG(config.seed + ':fractalwire');
  const kinds: FractalWireKind[] = ['sierpinski', 'menger', 'hilbert'];
  const kind = config.kind ?? kinds[Math.floor(rng() * kinds.length) % kinds.length];
  const data: LevelledEdges =
    kind === 'sierpinski' ? sierpinskiWire(config.tier === 'high' ? 4 : 3, 1.3)
    : kind === 'menger' ? mengerWire(2, 1.1)
    : hilbertEdges(config.tier === 'high' ? 4 : 3);
  const edgeCount = data.edgeCount;

  const packed = new Float32Array(edgeCount * 8);
  for (let e = 0; e < edgeCount; e++) {
    for (let v = 0; v < 2; v++) {
      const src = (e * 2 + v) * 3;
      const dst = e * 8 + v * 4;
      packed[dst] = data.positions[src];
      packed[dst + 1] = data.positions[src + 1];
      packed[dst + 2] = data.positions[src + 2];
      packed[dst + 3] = v === 0 ? rng() : data.levels[e];
    }
  }
  const segments: StorageBuffer = storage(gpu, packed.byteLength, 'read');
  segments.write(packed);

  const scale = kind === 'hilbert' ? 2.6 : 1.2;
  const thickness = config.thickness ?? (kind === 'hilbert' ? 1.8 : 1.1);
  const spin = [0.02 + rng() * 0.03, 0.03 + rng() * 0.04, 0.01 + rng() * 0.02].map((v) => (rng() < 0.5 ? -v : v));
  const breathPhase = rng() * Math.PI * 2;

  const lines: Draw = draw(gpu, {
    label: `eavi-fractalwire-${kind}`,
    shader: wireShader,
    vertices: 6,
    instances: edgeCount,
    blend: { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } },
    depth: { write: false, compare: 'less-equal' },
    set: {
      segments,
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      wire: {
        rotation: [0, 0, 0], scale, resolution: [1, 1], thickness,
        bass: 0, treble: 0, beat: 0, hue: 200, saturation: 0.7, brightness: 0.45,
        fogDensity: 0.08, opacity: 0, ripple: 0.0, time: 0, reveal: 0, pad1: 0,
      },
    },
  });

  return {
    name: `fractalwire:${kind}`,
    pointCount: edgeCount * 2,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const t = frame.timeSec * (0.3 + 0.7 * params.motionAmplitude) * params.cadence;
      // Reveal: a slow breath across the depth range, pushed deeper by builds; never a step.
      const breath = 0.5 + 0.5 * Math.sin(frame.timeSec * 0.05 + breathPhase);
      const reveal = 0.6 + (data.maxLevel + 1) * (0.3 + 0.35 * breath + 0.35 * frame.build);
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        wire: {
          rotation: [t * spin[0], t * spin[1], t * spin[2]],
          scale: scale * params.radialScale,
          resolution: [frame.resolution[0], frame.resolution[1]],
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          beat: params.beatPulse,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: 0.42 + params.bassEnergy * 0.2,
          fogDensity: 0.06 + params.midEnergy * 0.05,
          opacity: frame.opacity,
          time: frame.timeSec,
          reveal,
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

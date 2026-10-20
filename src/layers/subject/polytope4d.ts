import { draw, storage, type Draw, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import { createPolytope, POLYTOPE_KINDS, type PolytopeKind } from '../../visual/generators/polytopes';
import type { QualityTier } from '../../visual/quality';
import polytopeShader from './polytope-lines.wgsl';

export interface Polytope4DConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly kind?: PolytopeKind;
  readonly scale?: number;
  readonly thickness?: number;
}

/** 4D polytope subject: edges rotated in 4-space on the GPU and perspective-projected to 3D. */
export function createPolytope4DLayer(gpu: Gpu, config: Polytope4DConfig): Layer {
  const rng = createPRNG(config.seed + ':polytope');
  const pool: PolytopeKind[] = config.tier === 'low' ? ['tesseract', '16-cell', '5-cell'] : [...POLYTOPE_KINDS];
  const kind = config.kind ?? pool[Math.floor(rng() * pool.length) % pool.length];
  const poly = createPolytope(kind);
  const edgeCount = poly.edges.length;

  const packed = new Float32Array(edgeCount * 8);
  for (let e = 0; e < edgeCount; e++) {
    const [a, b] = poly.edges[e];
    packed.set(poly.vertices.subarray(a * 4, a * 4 + 4), e * 8);
    packed.set(poly.vertices.subarray(b * 4, b * 4 + 4), e * 8 + 4);
  }
  const segments: StorageBuffer = storage(gpu, packed.byteLength, 'read');
  segments.write(packed);

  const baseScale = config.scale ?? 1.3;
  const thickness = config.thickness ?? 1.5;
  // Incommensurate 4D plane speeds so the tumble never repeats.
  const speeds = [0.06 + rng() * 0.05, 0.04 + rng() * 0.04, 0.03 + rng() * 0.03, 0.015 + rng() * 0.02]
    .map((v) => (rng() < 0.5 ? -v : v));
  const phases = [rng(), rng(), rng(), rng()].map((v) => v * Math.PI * 2);

  const lines: Draw = draw(gpu, {
    label: `eavi-polytope-${kind}`,
    shader: polytopeShader,
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
      poly: {
        angles: [0, 0, 0, 0], resolution: [1, 1], scale: baseScale, eye: 2.6, thickness,
        bass: 0, treble: 0, beat: 0, hue: 200, saturation: 0.7, brightness: 0.8,
        fogDensity: 0.08, opacity: 0, time: 0, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: `polytope:${kind}`,
    pointCount: edgeCount * 2,
    async compile(scene: Target) {
      await lines.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      const t = frame.timeSec * (0.3 + 0.7 * params.motionAmplitude) * params.cadence;
      lines.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        poly: {
          angles: [
            phases[0] + t * speeds[0], phases[1] + t * speeds[1],
            phases[2] + t * speeds[2], phases[3] + t * speeds[3],
          ],
          resolution: [frame.resolution[0], frame.resolution[1]],
          scale: baseScale * params.radialScale,
          eye: 2.6 - params.bassEnergy * 0.35,
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          beat: params.beatPulse,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: 0.7 + params.bassEnergy * 0.3,
          fogDensity: 0.05 + params.midEnergy * 0.05,
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

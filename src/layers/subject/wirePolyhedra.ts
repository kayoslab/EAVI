import { draw, storage, type Draw, type FramePass, type Gpu, type StorageBuffer, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import {
  generatePolyhedronEdges, selectGenerationMode, selectShape, type GenerationMode, type PolyhedronEdgeData,
} from '../../visual/generators/polyhedraEdges';
import { generateNestedEdges } from '../../visual/generators/nestedSolids';
import { generateDualEdges } from '../../visual/generators/dualPolyhedra';
import { generateGeodesicEdges, maxGeodesicLevel } from '../../visual/generators/geodesicSphere';
import type { QualityTier } from '../../visual/quality';
import wireShader from './wire-lines.wgsl';

export interface WirePolyhedraConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  readonly mode?: GenerationMode;
  readonly scale?: number;
  readonly thickness?: number;
  readonly maxEdges?: number;
}

function generate(seed: string, mode: GenerationMode, maxEdges: number): PolyhedronEdgeData {
  const shape = selectShape(seed + ':shape');
  switch (mode) {
    case 'nested':
      return generateNestedEdges({ shape, layers: 3, radius: 1, seed });
    case 'dual':
      return generateDualEdges({ shape, radius: 1, seed });
    case 'geodesic':
      return generateGeodesicEdges({ radius: 1, level: Math.max(1, maxGeodesicLevel(maxEdges)), seed });
    default:
      return generatePolyhedronEdges({ shape, radius: 1, seed });
  }
}

/** Wireframe polyhedra subject: plain, nested, dual or geodesic edge sets drawn as glowing lines. */
export function createWirePolyhedraLayer(gpu: Gpu, config: WirePolyhedraConfig): Layer {
  const rng = createPRNG(config.seed + ':wire');
  const mode = config.mode ?? selectGenerationMode(config.seed, config.tier);
  const data = generate(config.seed, mode, config.maxEdges ?? (config.tier === 'high' ? 1200 : 500));
  const edgeCount = data.edgeCount;

  // Segment buffer: two vec4 per edge (xyz + per-vertex random).
  const packed = new Float32Array(edgeCount * 8);
  for (let e = 0; e < edgeCount; e++) {
    for (let v = 0; v < 2; v++) {
      const src = (e * 2 + v) * 3;
      const dst = e * 8 + v * 4;
      packed[dst] = data.positions[src];
      packed[dst + 1] = data.positions[src + 1];
      packed[dst + 2] = data.positions[src + 2];
      packed[dst + 3] = data.randoms[src];
    }
  }
  const segments: StorageBuffer = storage(gpu, packed.byteLength, 'read');
  segments.write(packed);

  const baseScale = config.scale ?? 1.15;
  const thickness = config.thickness ?? 1.6;
  const spin = [0.04 + rng() * 0.05, 0.06 + rng() * 0.07, 0.015 + rng() * 0.03].map((v) => (rng() < 0.5 ? -v : v));
  const ripple = 0.05 + rng() * 0.08;

  const lines: Draw = draw(gpu, {
    label: `eavi-wire-${mode}`,
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
        rotation: [0, 0, 0], scale: baseScale, resolution: [1, 1], thickness,
        bass: 0, treble: 0, beat: 0, hue: 200, saturation: 0.7, brightness: 0.8,
        fogDensity: 0.1, opacity: 0, ripple, time: 0, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: `wire:${mode}`,
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
        wire: {
          rotation: [t * spin[0], t * spin[1], t * spin[2]],
          scale: baseScale * params.radialScale,
          resolution: [frame.resolution[0], frame.resolution[1]],
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          beat: params.beatPulse,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: 0.7 + params.bassEnergy * 0.3,
          fogDensity: 0.06 + params.midEnergy * 0.06,
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

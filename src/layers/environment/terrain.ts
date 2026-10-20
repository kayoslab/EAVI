import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import type { QualityTier } from '../../visual/quality';
import linesShader from './terrain-lines.wgsl';
import pointsShader from './terrain-points.wgsl';

export interface TerrainConfig {
  readonly seed: string;
  readonly tier: QualityTier;
  /** 'dramatic' raises the peaks and deepens the valleys. */
  readonly variant?: 'gentle' | 'dramatic';
  readonly dpr?: number;
}

/**
 * Rolling wire-and-dot landscape in warm colours: indigo valleys to amber peaks, a slow aerial
 * drift over hills that never repeat. Points plus grid lines, never a solid surface.
 */
export function createTerrainLayer(gpu: Gpu, config: TerrainConfig): Layer {
  const rng = createPRNG(config.seed + ':terrain');
  const dramatic = config.variant === 'dramatic';
  const cols = config.tier === 'high' ? 160 : config.tier === 'medium' ? 110 : 70;
  const rows = config.tier === 'high' ? 120 : config.tier === 'medium' ? 84 : 54;
  const cell = 0.28;
  const heightScale = dramatic ? 2.4 + rng() * 0.6 : 0.9 + rng() * 0.4;
  const noiseScale = dramatic ? 0.09 + rng() * 0.03 : 0.12 + rng() * 0.04;
  const yOffset = dramatic ? -3.8 : -2.4;
  const hueMix = 0.08 + rng() * 0.1;
  const dprScale = Math.max(1, Math.min(2, config.dpr ?? 1));
  const lineCount = rows * (cols - 1) + cols * (rows - 1);
  const vertexCount = rows * cols;
  let scroll = rng() * 100;

  const uniforms = () => ({
    resolution: [1, 1], rows, cols, cell, scroll, heightScale, noiseScale,
    thickness: 1.1 * dprScale, pointSize: 2.2 * dprScale, hue: 200, hueMix,
    bass: 0, treble: 0, fogDensity: 0.06, opacity: 0, yOffset, brightness: 0.7, time: 0, pad0: 0,
  });
  const cameraInit = () => ({
    view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
    position: [0, 0, 0], time: 0,
  });
  const blend = { color: { src: 'one', dst: 'one' }, alpha: { src: 'one', dst: 'one' } } as const;

  const lines: Draw = draw(gpu, {
    label: `eavi-terrain-lines-${dramatic ? 'dramatic' : 'gentle'}`,
    shader: linesShader, vertices: 6, instances: lineCount, blend,
    depth: { write: false, compare: 'less-equal' },
    set: { camera: cameraInit(), terrain: uniforms() },
  });
  const points: Draw = draw(gpu, {
    label: `eavi-terrain-points-${dramatic ? 'dramatic' : 'gentle'}`,
    shader: pointsShader, vertices: 6, instances: vertexCount, blend,
    depth: { write: false, compare: 'less-equal' },
    set: { camera: cameraInit(), terrain: uniforms() },
  });

  return {
    name: dramatic ? 'terrain:dramatic' : 'terrain',
    pointCount: vertexCount,
    async compile(scene: Target) {
      await Promise.all([lines.compile(scene), points.compile(scene)]);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      // Slow aerial drift; cadence sets the pace, bass adds a little push.
      scroll += frame.deltaSec * (0.25 + params.cadence * 0.35) * (1 + params.bassEnergy * 0.3) * params.motionAmplitude;
      const cam = {
        view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
        position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
      };
      const shared = {
        resolution: [frame.resolution[0], frame.resolution[1]],
        scroll,
        heightScale: heightScale * params.radialScale,
        hue: params.paletteHue,
        bass: params.bassEnergy,
        treble: params.trebleEnergy,
        fogDensity: 0.045 + params.midEnergy * 0.04,
        opacity: frame.opacity,
        time: frame.timeSec,
      };
      lines.set({ camera: cam, terrain: { ...shared, brightness: 0.55 + params.bassEnergy * 0.2 } });
      points.set({ camera: cam, terrain: { ...shared, brightness: 0.8 + params.bassEnergy * 0.3 } });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(lines);
      pass.draw(points);
    },
    resize() {},
    dispose() {
      lines.dispose();
      points.dispose();
    },
  };
}

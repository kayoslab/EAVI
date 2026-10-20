import { draw, type Draw, type FramePass, type Gpu, type Target } from 'vgpu';
import type { Layer, LayerFrame } from '../Layer';
import { createPRNG } from '../../visual/prng';
import tunnelShader from './tunnel.wgsl';

export interface HyperTunnelConfig {
  readonly seed: string;
  readonly radius?: number;
  readonly segments?: number;
}

/** Kaleidoscopic raymarched tunnel environment that always extends ahead of the camera. */
export function createHyperTunnelLayer(gpu: Gpu, config: HyperTunnelConfig): Layer {
  const rng = createPRNG(config.seed + ':tunnel');
  const radius = config.radius ?? 2.6 + rng() * 0.8;
  const segments = config.segments ?? [3, 4, 5, 6, 7, 8][Math.floor(rng() * 6) % 6];
  const twist = (0.05 + rng() * 0.15) * (rng() < 0.5 ? -1 : 1);
  const ripple = 0.06 + rng() * 0.1;
  let scroll = 0;

  const tube: Draw = draw(gpu, {
    label: 'eavi-tunnel',
    shader: tunnelShader,
    vertices: 3,
    cull: 'none',
    depth: { write: true, compare: 'less-equal' },
    set: {
      camera: {
        view: new Float32Array(16), projection: new Float32Array(16), viewProjection: new Float32Array(16),
        position: [0, 0, 0], time: 0,
      },
      tunnel: {
        radius, segments, scroll: 0, twist, bass: 0, treble: 0, beat: 0, hue: 200, saturation: 0.7,
        brightness: 1, fogDensity: 0.09, opacity: 0, ripple, time: 0, pad0: 0, pad1: 0,
      },
    },
  });

  return {
    name: `tunnel:${segments}`,
    pointCount: 0,
    async compile(scene: Target) {
      await tube.compile(scene);
    },
    update(frame: LayerFrame) {
      const { params, camera } = frame;
      scroll += frame.deltaSec * (0.35 + params.cadence * 0.45) * (1 + params.bassEnergy * 0.4) * params.motionAmplitude;
      tube.set({
        camera: {
          view: camera.view, projection: camera.projection, viewProjection: camera.viewProjection,
          position: [camera.position[0], camera.position[1], camera.position[2]], time: frame.timeSec,
        },
        tunnel: {
          scroll,
          bass: params.bassEnergy,
          treble: params.trebleEnergy,
          beat: params.beatPulse,
          hue: params.paletteHue,
          saturation: Math.min(1, params.paletteSaturation + 0.15),
          brightness: 0.9 + params.bassEnergy * 0.3,
          fogDensity: 0.07 + params.midEnergy * 0.06,
          opacity: frame.opacity,
          ripple: ripple * (1 + params.trebleEnergy * 0.5),
          time: frame.timeSec,
        },
      });
    },
    encodeDraw(pass: FramePass) {
      pass.draw(tube);
    },
    resize() {},
    dispose() {
      tube.dispose();
    },
  };
}

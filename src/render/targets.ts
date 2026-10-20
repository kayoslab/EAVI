import { pingPong, target, type Gpu, type PingPongTargets, type Target } from 'vgpu';

export const SCENE_FORMAT = 'rgba16float' as const;

export interface RenderTargets {
  /** HDR scene with depth: layers draw here. */
  readonly scene: Target;
  /** Half-resolution bloom pair. */
  readonly bloomNear: readonly [Target, Target];
  /** Quarter-resolution bloom pair. */
  readonly bloomFar: readonly [Target, Target];
  /** Feedback history (after-image). */
  readonly history: PingPongTargets;
  /** HDR composite (scene + bloom) and the warped copy the finish pass samples. */
  readonly composite: Target;
  readonly warp: Target;
  /** 1×1 luminance limiter state (x = limited, y = measured). */
  readonly lumi: PingPongTargets;
  readonly size: readonly [number, number];
  resize(size: readonly [number, number]): void;
  dispose(): void;
}

function scaled(size: readonly [number, number], divisor: number): [number, number] {
  return [Math.max(1, Math.round(size[0] / divisor)), Math.max(1, Math.round(size[1] / divisor))];
}

export function createTargets(gpu: Gpu, initial: readonly [number, number]): RenderTargets {
  let size: readonly [number, number] = [Math.max(1, initial[0]), Math.max(1, initial[1])];
  const scene = target(gpu, { size, format: SCENE_FORMAT, depth: true, label: 'eavi-scene' });
  const half = scaled(size, 2);
  const quarter = scaled(size, 4);
  const bloomNear = [
    target(gpu, { size: half, format: SCENE_FORMAT, label: 'eavi-bloom-near-a' }),
    target(gpu, { size: half, format: SCENE_FORMAT, label: 'eavi-bloom-near-b' }),
  ] as const;
  const bloomFar = [
    target(gpu, { size: quarter, format: SCENE_FORMAT, label: 'eavi-bloom-far-a' }),
    target(gpu, { size: quarter, format: SCENE_FORMAT, label: 'eavi-bloom-far-b' }),
  ] as const;
  const history = pingPong(gpu, size[0], size[1], { format: SCENE_FORMAT, label: 'eavi-history' });
  const composite = target(gpu, { size, format: SCENE_FORMAT, label: 'eavi-composite' });
  const warp = target(gpu, { size, format: SCENE_FORMAT, label: 'eavi-warp' });
  const lumi = pingPong(gpu, 1, 1, { format: SCENE_FORMAT, label: 'eavi-lumi' });

  return {
    scene,
    bloomNear,
    bloomFar,
    history,
    composite,
    warp,
    lumi,
    get size() {
      return size;
    },
    resize(next) {
      size = [Math.max(1, Math.floor(next[0])), Math.max(1, Math.floor(next[1]))];
      scene.resize(size);
      const h = scaled(size, 2);
      const q = scaled(size, 4);
      bloomNear[0].resize(h);
      bloomNear[1].resize(h);
      bloomFar[0].resize(q);
      bloomFar[1].resize(q);
      history.read.resize(size);
      history.write.resize(size);
      composite.resize(size);
      warp.resize(size);
    },
    dispose() {
      for (const t of [scene, bloomNear[0], bloomNear[1], bloomFar[0], bloomFar[1], history.read, history.write, composite, warp, lumi.read, lumi.write]) {
        (t as { destroy?: () => void }).destroy?.();
      }
    },
  };
}

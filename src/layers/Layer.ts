import type { Frame, FramePass, Target } from 'vgpu';
import type { VisualParams } from '../visual/mappings';
import type { CameraState } from '../render/camera';

export interface LayerFrame {
  readonly timeSec: number;
  readonly deltaSec: number;
  readonly params: VisualParams;
  readonly camera: CameraState;
  readonly resolution: readonly [number, number];
  readonly pointer: { readonly x: number; readonly y: number };
  /** Global opacity 0-1 (intro fade, transitions). */
  readonly opacity: number;
  /** Raw time-domain bytes from the analyser (128 = silence), null before audio starts. */
  readonly waveform: Uint8Array | null;
  /** Structural envelopes from the Director: build ramps toward a drop, drop decays after one. */
  readonly build: number;
  readonly drop: number;
}

/**
 * A layer owns its GPU resources and encodes into the shared HDR scene target.
 * Compute work goes into encodeCompute (its own pass); draws go into encodeDraw (the scene pass).
 */
export interface Layer {
  readonly name: string;
  readonly pointCount: number;
  compile(scene: Target): Promise<void>;
  update(frame: LayerFrame): void;
  encodeCompute?(frame: Frame): void;
  encodeDraw(pass: FramePass): void;
  resize(size: readonly [number, number]): void;
  dispose(): void;
}

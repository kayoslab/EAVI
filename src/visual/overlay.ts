import type { Scene } from 'three';
import type { VisualParams } from './mappings';
import type { FrameState } from './types';

/** Generic overlay interface for composable layers over point-based geometry systems. */
export interface Overlay {
  init(scene: Scene, positions: Float32Array, params: VisualParams): void;
  draw(scene: Scene, frame: FrameState): void;
  cleanup(): void;
  setOpacity(opacity: number): void;
  readonly activeVertexCount: number;
}

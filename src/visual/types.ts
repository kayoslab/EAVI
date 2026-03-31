import type { VisualParams } from './mappings';

export interface FrameState {
  time: number;
  delta: number;
  params: VisualParams;
  width: number;
  height: number;
}

export interface GeometrySystem {
  init(ctx: CanvasRenderingContext2D, seed: string, params: VisualParams): void;
  draw(ctx: CanvasRenderingContext2D, frame: FrameState): void;
}

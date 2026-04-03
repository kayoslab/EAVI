import type { Scene } from 'three';
import type { VisualParams } from './mappings';

export interface AttributeSpec {
  name: string;
  itemSize: number;
}

export interface FrameState {
  time: number;
  delta: number;
  elapsed: number;
  params: VisualParams;
  width: number;
  height: number;
  pointerX?: number;
  pointerY?: number;
}

export interface HealthGateResult {
  passed: boolean;
  shaderErrors: Array<{ shaderType: string; message: string }>;
  geometryErrors: Array<{ attribute: string; reason: string; systemName?: string }>;
}

export interface GeometrySystemInfo {
  name: string;
  geometry: import('three').BufferGeometry;
  requiredAttrs: AttributeSpec[];
}

export interface GeometrySystem {
  init(
    scene: Scene,
    seed: string,
    params: VisualParams,
  ): void;
  draw(scene: Scene, frame: FrameState): void;
  cleanup?(): void;
  setOpacity?(opacity: number): void;
}

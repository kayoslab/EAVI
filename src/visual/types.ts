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

export interface FramingConfig {
  targetDistance: number;
  lookOffset: [number, number, number];
  nearClip: number;
  farClip: number;
  driftScale?: [number, number, number];
  /** Camera motion style: 'orbit' circles around centered objects, 'flythrough' travels forward through environments */
  cameraMode?: 'orbit' | 'flythrough';
  /** Orbit radius for 'orbit' mode (default: targetDistance) */
  orbitRadius?: number;
  /** Forward travel speed for 'flythrough' mode in units/second (default: 0.5) */
  flythroughSpeed?: number;
  /** Cycle length for flythrough camera wrap-around in world units (default: 80) */
  flythroughCycleLength?: number;
  /** Bloom intensity multiplier for this mode (default: 1.0) */
  bloomStrength?: number;
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

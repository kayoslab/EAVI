// Stub: bloom postprocessing composer (US-077)
// This module will be implemented to set up EffectComposer with RenderPass + UnrealBloomPass.

import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import type { QualityProfile } from './quality';

export function initComposer(
  _renderer: WebGLRenderer,
  _scene: Scene,
  _camera: PerspectiveCamera,
  _quality: QualityProfile,
): { composer: unknown; bloomPass: unknown } | null {
  // TODO: implement EffectComposer pipeline
  return null;
}

export function resizeComposer(
  _composer: unknown,
  _width: number,
  _height: number,
): void {
  // TODO: implement composer resize
}

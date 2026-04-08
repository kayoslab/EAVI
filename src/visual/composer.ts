import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { Vector2 } from 'three';
import type { QualityProfile } from './quality';

export interface ComposerResult {
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
}

export function initComposer(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  quality: QualityProfile,
): ComposerResult | null {
  if (!quality.enableBloom) return null;

  try {
    const size = renderer.getSize(new Vector2());
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const bloomPass = new UnrealBloomPass(
      new Vector2(size.x, size.y),
      quality.bloomStrength,
      quality.bloomRadius,
      quality.bloomThreshold,
    );
    composer.addPass(bloomPass);

    return { composer, bloomPass };
  } catch (err) {
    console.warn('[EAVI] Failed to init bloom composer, falling back to direct render:', err);
    return null;
  }
}

export function resizeComposer(composer: EffectComposer, width: number, height: number): void {
  composer.setSize(width, height);
}

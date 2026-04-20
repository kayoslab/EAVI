import type { WebGLRenderer, PerspectiveCamera } from 'three';
import { updateCameraForOrientation } from './scene';

function getViewportSize(): { width: number; height: number } {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

export function attachResizeHandler(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  resolutionScale?: number,
  composer?: { setSize(width: number, height: number): void } | null,
): () => void {
  const scale = resolutionScale ?? 1.0;

  const onResize = () => {
    const { width, height } = getViewportSize();
    camera.aspect = width / height;
    updateCameraForOrientation(camera);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
  };

  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  window.visualViewport?.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.visualViewport?.removeEventListener('resize', onResize);
  };
}

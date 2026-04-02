import type { WebGLRenderer, PerspectiveCamera } from 'three';

export function attachResizeHandler(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
  resolutionScale?: number,
): () => void {
  const scale = resolutionScale ?? 1.0;

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * scale);
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
  };
}

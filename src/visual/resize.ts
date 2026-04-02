import type { WebGLRenderer, PerspectiveCamera } from 'three';

export function attachResizeHandler(
  renderer: WebGLRenderer,
  camera: PerspectiveCamera,
): () => void {
  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', onResize);

  return () => {
    window.removeEventListener('resize', onResize);
  };
}

import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import type { ShaderErrorCollector } from './shaderErrorCollector';

export function validateShaderCompilation(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  errorCollector: ShaderErrorCollector,
): void {
  renderer.compile(scene, camera);

  if (errorCollector.hasErrors()) {
    const errors = errorCollector.getErrors();
    for (const err of errors) {
      console.error(err.summary);
    }
    const types = errors.map((e) => e.shaderType).join(', ');
    throw new Error(
      `Shader compilation failed (${errors.length} error(s) in: ${types}). See console for details.`,
    );
  }
}

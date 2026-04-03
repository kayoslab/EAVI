import type { WebGLRenderer, Scene, PerspectiveCamera } from 'three';
import type { ShaderErrorCollector } from './shaderErrorCollector';
import type { HealthGateResult, GeometrySystemInfo } from './types';
import { validateGeometryAttributes } from './geometryValidator';

const PREFIX = '[EAVI health-gate]';

export function runStartupHealthGate(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  errorCollector: ShaderErrorCollector,
  geometrySystems: GeometrySystemInfo[],
): HealthGateResult {
  const shaderErrors: HealthGateResult['shaderErrors'] = [];
  const geometryErrors: HealthGateResult['geometryErrors'] = [];

  // 1. Force synchronous shader compilation and check for errors
  renderer.compile(scene, camera);

  if (errorCollector.hasErrors()) {
    for (const err of errorCollector.getErrors()) {
      shaderErrors.push({ shaderType: err.shaderType, message: err.message });
    }
  }

  // 2. Validate geometry attributes for all provided systems
  for (const sys of geometrySystems) {
    const result = validateGeometryAttributes(sys.geometry, sys.requiredAttrs);
    if (!result.ok) {
      for (const err of result.errors) {
        geometryErrors.push({
          attribute: err.attribute,
          reason: err.reason,
          systemName: sys.name,
        });
      }
    }
  }

  const passed = shaderErrors.length === 0 && geometryErrors.length === 0;

  // 3. Log structured failures
  if (!passed) {
    if (shaderErrors.length > 0) {
      console.error(
        `${PREFIX} Shader compilation failed (${shaderErrors.length} error(s)):`,
        shaderErrors.map((e) => `[${e.shaderType}] ${e.message}`).join('\n'),
      );
    }
    if (geometryErrors.length > 0) {
      console.error(
        `${PREFIX} Geometry validation failed (${geometryErrors.length} error(s)):`,
        geometryErrors
          .map((e) => `${e.systemName ? `[${e.systemName}] ` : ''}${e.attribute}: ${e.reason}`)
          .join('\n'),
      );
    }
  }

  return { passed, shaderErrors, geometryErrors };
}

import * as THREE from 'three';
import { ShaderErrorCollector } from './shaderErrorCollector';
import { createBackground } from './background';

export class WebGLUnavailableError extends Error {
  constructor(message = 'WebGL is not available in your browser.') {
    super(message);
    this.name = 'WebGLUnavailableError';
  }
}

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export interface SceneOptions {
  resolutionScale?: number;
  disableAntialias?: boolean;
  onContextRestored?: () => void;
}

export function initScene(
  container: HTMLElement,
  options?: SceneOptions,
): { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; cleanupContextHandlers: () => void; errorCollector: ShaderErrorCollector; background: ReturnType<typeof createBackground> } {
  if (!detectWebGL()) {
    throw new WebGLUnavailableError();
  }

  const resolutionScale = options?.resolutionScale ?? 1.0;
  const disableAntialias = options?.disableAntialias ?? false;

  // US-039: WebGL is the only rendering backend; Canvas2D is not supported
  const renderer = new THREE.WebGLRenderer({
    antialias: !disableAntialias,
    alpha: false,
    powerPreference: 'high-performance',
  });

  // US-048: Shader error capture — single registration point
  const errorCollector = new ShaderErrorCollector();
  if (renderer.debug) {
    renderer.debug.onShaderError = (gl, _program, glVertexShader, glFragmentShader) => {
      const vtxLog = gl.getShaderInfoLog(glVertexShader);
      if (vtxLog) {
        errorCollector.collect(gl, glVertexShader, 'VERTEX', vtxLog);
      }
      const fragLog = gl.getShaderInfoLog(glFragmentShader);
      if (fragLog) {
        errorCollector.collect(gl, glFragmentShader, 'FRAGMENT', fragLog);
      }
    };
  }

  renderer.setClearColor(0x000000);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * resolutionScale);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  container.appendChild(renderer.domElement);

  const aspect = window.innerWidth / window.innerHeight;
  const isPortrait = window.innerHeight > window.innerWidth * 1.2;
  const camera = new THREE.PerspectiveCamera(isPortrait ? 75 : 60, aspect, 0.1, 100);
  camera.position.set(0, 0, 5);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);

  // Persistent ambient light for geometry systems (unlit materials don't need it,
  // but it's here for future extensibility with lit materials)
  const ambient = new THREE.AmbientLight(0xffffff, 0.4);
  scene.add(ambient);

  // GPU context loss handling for mobile crash prevention
  const canvas = renderer.domElement;
  const onContextLost = (event: Event) => {
    event.preventDefault();
  };
  const onContextRestored = () => {
    renderer.setClearColor(0x000000);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * resolutionScale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    options?.onContextRestored?.();
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const cleanupContextHandlers = () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  };

  // Background atmosphere mesh (rendered behind everything)
  const background = createBackground();
  scene.add(background.mesh);

  return { renderer, scene, camera, cleanupContextHandlers, errorCollector, background };
}

/** Adjust camera FOV for portrait vs landscape orientation. */
export function updateCameraForOrientation(camera: THREE.PerspectiveCamera): void {
  const isPortrait = window.innerHeight > window.innerWidth * 1.2;
  camera.fov = isPortrait ? 75 : 60;
  camera.updateProjectionMatrix();
}

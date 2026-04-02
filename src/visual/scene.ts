import * as THREE from 'three';

export interface SceneOptions {
  resolutionScale?: number;
  disableAntialias?: boolean;
}

export function initScene(
  container: HTMLElement,
  options?: SceneOptions,
): { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; cleanupContextHandlers: () => void } {
  const resolutionScale = options?.resolutionScale ?? 1.0;
  const disableAntialias = options?.disableAntialias ?? false;

  const renderer = new THREE.WebGLRenderer({
    antialias: !disableAntialias,
    alpha: false,
    powerPreference: 'high-performance',
  });

  renderer.setClearColor(0x000000);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * resolutionScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.appendChild(renderer.domElement);

  const aspect = window.innerWidth / window.innerHeight;
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
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
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
  };
  canvas.addEventListener('webglcontextlost', onContextLost);
  canvas.addEventListener('webglcontextrestored', onContextRestored);

  const cleanupContextHandlers = () => {
    canvas.removeEventListener('webglcontextlost', onContextLost);
    canvas.removeEventListener('webglcontextrestored', onContextRestored);
  };

  return { renderer, scene, camera, cleanupContextHandlers };
}

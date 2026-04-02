import './style.css';
import { fetchGeoHint } from './input/geo';
import { readSignals } from './input/signals';
import { initSessionSeed } from './seed/sessionSeed';
import { initAudio } from './audio/player';
import { createMuteButton } from './ui/audioToggle';
import { createInfoButton, createInfoOverlay } from './ui/infoOverlay';
import { initScene } from './visual/scene';
import { attachResizeHandler } from './visual/resize';
import { startLoop, type LoopDeps } from './visual/renderLoop';
import { initPointer } from './input/pointer';
import { addPlaceholder } from './visual/placeholder';
import { createParticleField } from './visual/systems/particleField';
import { createRibbonField } from './visual/systems/ribbonField';
import { createPointCloud } from './visual/systems/pointCloud';
import { createModeManager } from './visual/modeManager';
import { computeQuality } from './visual/quality';

// Quick pre-quality heuristic for antialias (renderer is created before quality resolves)
const quickTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const lowDPR = window.devicePixelRatio <= 1;

// Three.js scene bootstrap — render immediately so the dark scene is visible before async work
const app = document.getElementById('app')!;
const { renderer, scene, camera } = initScene(app, {
  disableAntialias: quickTouch && lowDPR,
});
let cleanupResize = attachResizeHandler(renderer, camera);

// Add placeholder 3D object
const { mesh, ambient, directional } = addPlaceholder(scene);

// Shared deps object — mutated as async work resolves
const deps: LoopDeps = {
  placeholderMesh: mesh,
  placeholderAmbient: ambient,
  placeholderDirectional: directional,
};

// Pointer tracking
const pointer = initPointer(renderer.domElement);
deps.getPointerState = () => pointer.getState();

// Start loop immediately with partial deps (renders placeholder + defaults)
startLoop(renderer, scene, camera, deps);

const geoPromise = fetchGeoHint();

geoPromise.then((geo) => {
  console.debug('[EAVI] geo hint:', geo);
  const signals = readSignals();
  const seed = initSessionSeed(signals, geo);
  console.debug('[EAVI] session seed:', seed);

  // Compute quality tier from device signals
  const quality = computeQuality(signals);
  console.debug('[EAVI] quality tier:', quality.tier);

  // Apply resolution scale to renderer and resize handler
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2) * quality.resolutionScale);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  cleanupResize();
  cleanupResize = attachResizeHandler(renderer, camera, quality.resolutionScale);

  // Create geometry systems with quality-driven config
  const particles = createParticleField({
    maxParticles: quality.maxParticles,
    enableSparkle: quality.enableSparkle,
  });
  const ribbon = createRibbonField({
    maxPoints: quality.maxRibbonPoints,
    enableSparkle: quality.enableSparkle,
  });
  const pointCloud = createPointCloud({
    maxPoints: quality.maxPoints,
    enableSparkle: quality.enableSparkle,
  });
  const modeManager = createModeManager([
    { name: 'particles', factory: () => particles },
    { name: 'ribbon', factory: () => ribbon },
    { name: 'pointcloud', factory: () => pointCloud },
  ]);

  // Enrich loop deps — geometry will init on next frame
  deps.seed = seed;
  deps.signals = signals;
  deps.geo = geo;
  deps.quality = quality;
  deps.geometrySystem = modeManager;
});

// Info button + overlay — append immediately, no async dependency
document.body.appendChild(createInfoButton());
document.body.appendChild(createInfoOverlay());

// Start audio (non-blocking — visuals must not depend on this)
const audioPromise = initAudio();

audioPromise.then((player) => {
  console.debug('[EAVI] audio state:', player.state);
  document.body.appendChild(createMuteButton(player));
  deps.getAnalyserPipeline = () => player.getPipeline();
});

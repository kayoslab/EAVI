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
// TODO: Port Canvas 2D geometry systems to Three.js in future stories
// import { createParticleField } from './visual/systems/particleField';
// import { createWaveField } from './visual/systems/waveField';
// import { createModeManager } from './visual/modeManager';
// import { computeQuality } from './visual/quality';

// Three.js scene bootstrap — render immediately so the dark scene is visible before async work
const app = document.getElementById('app')!;
const { renderer, scene, camera } = initScene(app);
attachResizeHandler(renderer, camera);

// Add placeholder 3D object
const { mesh } = addPlaceholder(scene);

// Shared deps object — mutated as async work resolves
const deps: LoopDeps = {
  placeholderMesh: mesh,
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

  // Enrich loop deps — geometry will init on next frame
  deps.seed = seed;
  deps.signals = signals;
  deps.geo = geo;
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

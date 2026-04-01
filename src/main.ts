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
import { createParticleField } from './visual/systems/particleField';
import { computeQuality } from './visual/quality';

// Compute quality profile synchronously before scene init
const quality = computeQuality(readSignals());
console.debug('[EAVI] quality tier:', quality.tier);

// Canvas shell — render immediately so the dark canvas is visible before async work
const app = document.getElementById('app')!;
const { canvas, ctx } = initScene(app, quality.resolutionScale);
attachResizeHandler(canvas, ctx, quality.resolutionScale);

// Shared deps object — mutated as async work resolves
const deps: LoopDeps = {
  geometrySystem: createParticleField({
    maxParticles: quality.maxParticles,
    enableSparkle: quality.enableSparkle,
  }),
};

// Pointer tracking
const pointer = initPointer(canvas);
deps.getPointerState = () => pointer.getState();

// Start loop immediately with partial deps (renders black + defaults)
startLoop(canvas, ctx, deps);

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

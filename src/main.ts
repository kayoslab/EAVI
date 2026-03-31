import './style.css';
import { fetchGeoHint } from './input/geo';
import { readSignals } from './input/signals';
import { initSessionSeed } from './seed/sessionSeed';
import { initAudio } from './audio/player';
import { createMuteButton } from './ui/audioToggle';
import { initScene } from './visual/scene';
import { attachResizeHandler } from './visual/resize';
import { startLoop } from './visual/renderLoop';

// Canvas shell — render immediately so the dark canvas is visible before async work
const app = document.getElementById('app')!;
const { canvas, ctx } = initScene(app);
attachResizeHandler(canvas, ctx);
startLoop(canvas, ctx);

const geoPromise = fetchGeoHint();

geoPromise.then((geo) => {
  console.debug('[EAVI] geo hint:', geo);
  const signals = readSignals();
  const seed = initSessionSeed(signals, geo);
  console.debug('[EAVI] session seed:', seed);
});

// Start audio (non-blocking — visuals must not depend on this)
const audioPromise = initAudio();

audioPromise.then((player) => {
  console.debug('[EAVI] audio state:', player.state);
  document.body.appendChild(createMuteButton(player));
});

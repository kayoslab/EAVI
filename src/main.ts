import { fetchGeoHint } from './input/geo';
import { initAudio } from './audio/player';
import { createMuteButton } from './ui/audioToggle';

const geoPromise = fetchGeoHint();

geoPromise.then((geo) => {
  console.debug('[EAVI] geo hint:', geo);
});

// Start audio (non-blocking — visuals must not depend on this)
const audioPromise = initAudio();

audioPromise.then((player) => {
  console.debug('[EAVI] audio state:', player.state);
  document.body.appendChild(createMuteButton(player));
});

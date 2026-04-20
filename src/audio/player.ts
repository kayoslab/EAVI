import { createPipeline } from './analyser';
import { pickTrack } from './trackList';

export type AudioPlayerState = 'loading' | 'playing' | 'suspended' | 'error';

export interface AudioPlayer {
  readonly state: AudioPlayerState;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  getAnalyserNode(): AnalyserNode;
  getPipeline(): ReturnType<typeof createPipeline>;
  destroy(): void;
}

const CROSSFADE_DURATION = 2; // seconds

function createAudioElement(src: string): HTMLAudioElement {
  const el = new Audio(src);
  el.crossOrigin = 'anonymous';
  el.loop = false;
  el.preload = 'metadata';
  el.muted = true;
  return el;
}

export async function initAudio(): Promise<AudioPlayer> {
  const ctx = new AudioContext();

  // Shared nodes: analyser -> masterGain -> destination
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.8;

  const masterGain = ctx.createGain();
  masterGain.gain.value = 0; // starts muted

  analyser.connect(masterGain);
  masterGain.connect(ctx.destination);

  const pipeline = createPipeline(analyser);

  // Dual-deck state
  interface Deck {
    el: HTMLAudioElement;
    source: MediaElementAudioSourceNode;
    gain: GainNode;
  }

  function createDeck(src: string): Deck {
    const el = createAudioElement(src);
    el.addEventListener('error', () => {
      console.error('[EAVI] audio element error', el.error, el.currentSrc);
    });
    const source = ctx.createMediaElementSource(el);
    const gain = ctx.createGain();
    gain.gain.value = 0;

    // source -> gain -> analyser (WebAudio allows multiple connections)
    source.connect(gain);
    gain.connect(analyser);

    return { el, source, gain };
  }

  let currentTrack = pickTrack();
  console.log('[EAVI] selected track', currentTrack);

  let deckA: Deck = createDeck(currentTrack);
  let nextTrackSrc = pickTrack(currentTrack);
  let deckB: Deck = createDeck(nextTrackSrc);

  let activeDeck: 'A' | 'B' = 'A';
  let playerState: AudioPlayerState = 'loading';
  let isMuted = true;
  let crossfading = false;

  function getActiveDeck(): Deck {
    return activeDeck === 'A' ? deckA : deckB;
  }

  function getInactiveDeck(): Deck {
    return activeDeck === 'A' ? deckB : deckA;
  }

  async function startCrossfade(): Promise<void> {
    if (crossfading) return;
    crossfading = true;

    const outDeck = getActiveDeck();
    const inDeck = getInactiveDeck();

    // Pick and load next track on inactive deck
    const previousTrack = currentTrack;
    currentTrack = pickTrack(previousTrack);
    console.log('[EAVI] crossfade to', currentTrack);

    inDeck.el.src = currentTrack;
    inDeck.el.load();
    inDeck.el.muted = isMuted;

    try {
      await inDeck.el.play();
    } catch (err) {
      console.warn('[EAVI] crossfade play failed', err);
      crossfading = false;
      return;
    }

    const now = ctx.currentTime;

    // Fade out old deck
    outDeck.gain.gain.setValueAtTime(outDeck.gain.gain.value, now);
    outDeck.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION);

    // Fade in new deck
    inDeck.gain.gain.setValueAtTime(0, now);
    inDeck.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_DURATION);

    // Switch active deck
    activeDeck = activeDeck === 'A' ? 'B' : 'A';

    // After crossfade, stop old deck
    setTimeout(() => {
      outDeck.el.pause();
      outDeck.el.currentTime = 0;
      crossfading = false;

      // Pre-load next track for the now-inactive deck
      nextTrackSrc = pickTrack(currentTrack);
    }, CROSSFADE_DURATION * 1000 + 100);
  }

  // Wire ended events on both decks
  deckA.el.addEventListener('ended', () => {
    if (activeDeck === 'A') void startCrossfade();
  });
  deckB.el.addEventListener('ended', () => {
    if (activeDeck === 'B') void startCrossfade();
  });

  // Start first deck
  deckA.gain.gain.value = 1;
  try {
    await deckA.el.play();
    playerState = 'playing';
  } catch (err) {
    if (deckA.el.error) {
      playerState = 'error';
      console.error('[EAVI] media error', deckA.el.error, deckA.el.currentSrc, err);
    } else {
      playerState = 'suspended';
      console.warn('[EAVI] initial play blocked or deferred', err);
    }
  }

  return {
    get state(): AudioPlayerState {
      return playerState;
    },

    get muted(): boolean {
      return isMuted;
    },

    setMuted(muted: boolean): void {
      isMuted = muted;

      // Mute affects master gain, not individual deck gains
      masterGain.gain.value = muted ? 0 : 1;

      // Also set HTML element muted for browser-level muting
      deckA.el.muted = muted;
      deckB.el.muted = muted;

      if (!muted) {
        void ctx.resume();

        const deck = getActiveDeck();
        void deck.el.play()
          .then(() => {
            playerState = 'playing';
          })
          .catch((err) => {
            if (deck.el.error) {
              playerState = 'error';
              console.error('[EAVI] play failed after unmute', deck.el.error, deck.el.currentSrc, err);
            } else {
              playerState = 'suspended';
              console.warn('[EAVI] play still blocked after unmute', err);
            }
          });
      } else {
        if (playerState === 'playing') {
          playerState = 'suspended';
        }
      }
    },

    getAnalyserNode(): AnalyserNode {
      return analyser;
    },

    getPipeline(): ReturnType<typeof createPipeline> {
      return pipeline;
    },

    destroy(): void {
      deckA.el.pause();
      deckA.el.src = '';
      deckB.el.pause();
      deckB.el.src = '';
      void ctx.close();
    },
  };
}

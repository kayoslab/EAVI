import { pickTrack } from './trackList';
import { createAnalyser, createPipeline, type AnalyserPipeline } from './analyser';

export type AudioPlayerState = 'loading' | 'playing' | 'suspended' | 'error';

export interface AudioPlayer {
  readonly state: AudioPlayerState;
  readonly muted: boolean;
  setMuted(muted: boolean): void;
  getAnalyserNode(): AnalyserNode | null;
  getPipeline(): AnalyserPipeline | null;
  destroy(): void;
}

/**
 * Initialise the audio system: create an AudioContext, load a random track,
 * and attempt muted autoplay. Resolves with an AudioPlayer regardless of
 * whether autoplay succeeds or is blocked.
 */
export async function initAudio(): Promise<AudioPlayer> {
  const ctx = new AudioContext();
  const { analyser, gainNode, connectSource } = createAnalyser(ctx);
  const pipeline = createPipeline(analyser);

  let currentTrack = pickTrack();
  let audioEl = createAudioElement(currentTrack);
  const source = ctx.createMediaElementSource(audioEl);
  connectSource(source);

  // Muted: set gain to 0 before attempting play
  gainNode.gain.value = 0;

  let playerState: AudioPlayerState = 'loading';
  let isMuted = true;

  try {
    await audioEl.play();
    playerState = 'playing';
  } catch {
    // Autoplay blocked — not an error, just suspended
    playerState = 'suspended';
    console.debug('[EAVI] autoplay blocked, waiting for user gesture');
  }

  const player: AudioPlayer = {
    get state() {
      return playerState;
    },
    get muted() {
      return isMuted;
    },
    setMuted(muted: boolean) {
      isMuted = muted;
      if (muted) {
        gainNode.gain.value = 0;
      } else {
        gainNode.gain.value = 1;
        // Resume context if suspended (requires user gesture)
        if (ctx.state === 'suspended') {
          void ctx.resume();
        }
        // If playback hasn't started yet, try again
        if (playerState === 'suspended') {
          audioEl.play().then(() => {
            playerState = 'playing';
          }).catch(() => {
            // Still blocked — user will need to try again
          });
        }
      }
    },
    getAnalyserNode() {
      return analyser;
    },
    getPipeline() {
      return pipeline;
    },
    destroy() {
      audioEl.pause();
      void ctx.close();
    },
  };

  // When the current track ends, load the next one
  audioEl.addEventListener('ended', () => {
    const next = pickTrack(currentTrack);
    currentTrack = next;
    audioEl.src = next;
    audioEl.play().catch(() => {
      // Playback may still be blocked
    });
  });

  return player;
}

function createAudioElement(src: string): HTMLAudioElement {
  const el = new Audio(src);
  el.crossOrigin = 'anonymous';
  return el;
}

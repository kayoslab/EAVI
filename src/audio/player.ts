import { createAnalyser, createPipeline } from './analyser';
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
  const { analyser, gainNode, connectSource } = createAnalyser(ctx);
  const pipeline = createPipeline(analyser);

  let currentTrack = pickTrack();
  console.log('[EAVI] selected track', currentTrack);

  let audioEl = createAudioElement(currentTrack);
  audioEl.addEventListener('error', () => {
    console.error('[EAVI] audio element error', audioEl.error, audioEl.currentSrc);
  });

  const source = ctx.createMediaElementSource(audioEl);
  connectSource(source);

  gainNode.gain.value = 0;

  let playerState: AudioPlayerState = 'loading';
  let isMuted = true;

  const playCurrentTrack = async (): Promise<void> => {
    try {
      await audioEl.play();
      playerState = 'playing';
    } catch (err) {
      if (audioEl.error) {
        playerState = 'error';
        console.error('[EAVI] media error', audioEl.error, audioEl.currentSrc, err);
      } else {
        playerState = 'suspended';
        console.warn('[EAVI] initial play blocked or deferred', err);
      }
    }
  };

  audioEl.addEventListener('ended', async () => {
    try {
      const previousTrack = currentTrack;
      currentTrack = pickTrack(previousTrack);
      console.log('[EAVI] next track', currentTrack);

      audioEl.src = currentTrack;
      audioEl.load();

      if (!isMuted) {
        await audioEl.play();
        playerState = 'playing';
      } else {
        playerState = 'suspended';
      }
    } catch (err) {
      playerState = 'error';
      console.error('[EAVI] failed to advance to next track', err);
    }
  });

  await playCurrentTrack();

  return {
    get state(): AudioPlayerState {
      return playerState;
    },

    get muted(): boolean {
      return isMuted;
    },

    setMuted(muted: boolean): void {
      isMuted = muted;
      audioEl.muted = muted;
      gainNode.gain.value = muted ? 0 : 1;

      if (!muted) {
        void ctx.resume();

        void audioEl.play()
          .then(() => {
            playerState = 'playing';
          })
          .catch((err) => {
            if (audioEl.error) {
              playerState = 'error';
              console.error('[EAVI] play failed after unmute', audioEl.error, audioEl.currentSrc, err);
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
      audioEl.pause();
      audioEl.src = '';
      void ctx.close();
    },
  };
}
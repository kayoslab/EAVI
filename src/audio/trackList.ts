// src/audio/trackList.ts
export const TRACKS: string[] = [
  '/audio/Balynt & Azeon -  Back To You (Instrumental).mp3',
  '/audio/Balynt - Outer Space (Instrumental).mp3',
  '/audio/Roa - Glory.mp3',
  '/audio/extenz - Hope.mp3',
];

console.log('[EAVI] TRACKS', TRACKS);

export function pickTrack(previous?: string): string {
  if (TRACKS.length === 0) {
    throw new Error('[EAVI] No audio tracks configured.');
  }

  if (TRACKS.length === 1) {
    return TRACKS[0];
  }

  let pick: string;
  do {
    pick = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  } while (pick === previous);

  return pick;
}
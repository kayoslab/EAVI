/** Static manifest of audio tracks served from /public/audio. */
export const TRACKS: readonly string[] = [
  '/audio/track-01.mp3',
  '/audio/track-02.mp3',
  '/audio/track-03.mp3',
];

/**
 * Pick a random track URL, avoiding an immediate repeat when possible.
 */
export function pickTrack(previous?: string): string {
  if (TRACKS.length <= 1) return TRACKS[0];

  let pick: string;
  do {
    pick = TRACKS[Math.floor(Math.random() * TRACKS.length)];
  } while (pick === previous);

  return pick;
}

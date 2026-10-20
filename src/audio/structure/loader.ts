// src/audio/structure/loader.ts
// Fetches the build-time analysis JSON for a track. Null on any failure so the
// caller can fall back to the live onset source; never throws.

import { analysisUrlForTrack, validateTrackAnalysis, type TrackAnalysis } from './analysis.ts';

export async function loadTrackAnalysis(trackPath: string): Promise<TrackAnalysis | null> {
  try {
    const res = await fetch(analysisUrlForTrack(trackPath), { cache: 'force-cache' });
    if (!res.ok) return null;
    const json: unknown = await res.json();
    return validateTrackAnalysis(json);
  } catch {
    return null;
  }
}

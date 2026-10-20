// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  analysisIdForTrack,
  analysisUrlForTrack,
  fnv1a32Hex,
  trackBasename,
  validateTrackAnalysis,
  type TrackAnalysis,
} from '../../../src/audio/structure/analysis';

function sample(): TrackAnalysis {
  return {
    version: 1,
    trackPath: '/audio/Roa - Glory.mp3',
    duration: 10,
    bpm: 120,
    beats: [0.5, 1, 1.5],
    downbeats: [0.5],
    energy: [{ t: 0, bass: 0.1, mid: 0.2, treble: 0.3, total: 0.2 }],
    sections: [{ start: 0, end: 10, label: 'verse', energy: 0.4 }],
    events: [{ t: 2, kind: 'drop', strength: 0.9 }],
  };
}

describe('analysis ids', () => {
  it('fnv1a32Hex matches the reference vector', () => {
    expect(fnv1a32Hex('')).toBe('811c9dc5');
    expect(fnv1a32Hex('a')).toBe('e40c292c');
  });

  it('is stable across encoded and decoded paths', () => {
    const plain = analysisIdForTrack('/audio/Roa - Glory.mp3');
    const encoded = analysisIdForTrack('/audio/Roa%20-%20Glory.mp3');
    expect(plain).toBe(encoded);
    expect(plain).toMatch(/^[0-9a-f]{8}$/);
    expect(plain).toBe(fnv1a32Hex('Roa - Glory.mp3'));
  });

  it('uses only the basename', () => {
    expect(trackBasename('/x/y/track.mp3')).toBe('track.mp3');
    expect(analysisIdForTrack('/a/track.mp3')).toBe(analysisIdForTrack('track.mp3'));
  });

  it('builds the analysis URL', () => {
    const id = analysisIdForTrack('/audio/cosmetic.mp3');
    expect(analysisUrlForTrack('/audio/cosmetic.mp3')).toBe(`/audio/analysis/${id}.json`);
  });

  it('handles invalid percent-encoding without throwing', () => {
    expect(() => analysisIdForTrack('/audio/%E0%A4%A.mp3')).not.toThrow();
  });
});

describe('validateTrackAnalysis', () => {
  it('accepts a valid document', () => {
    const v = sample();
    expect(validateTrackAnalysis(JSON.parse(JSON.stringify(v)))).toEqual(v);
  });

  it('rejects non-objects', () => {
    expect(validateTrackAnalysis(null)).toBeNull();
    expect(validateTrackAnalysis('x')).toBeNull();
    expect(validateTrackAnalysis([])).toBeNull();
  });

  it('rejects a wrong version', () => {
    expect(validateTrackAnalysis({ ...sample(), version: 2 })).toBeNull();
  });

  it('rejects non-finite numbers', () => {
    expect(validateTrackAnalysis({ ...sample(), duration: Number.NaN })).toBeNull();
    expect(validateTrackAnalysis({ ...sample(), beats: [0.5, 'x'] })).toBeNull();
    expect(validateTrackAnalysis({ ...sample(), energy: [{ t: 0, bass: 1, mid: 1, treble: 1 }] })).toBeNull();
  });

  it('rejects unknown labels and kinds', () => {
    expect(validateTrackAnalysis({ ...sample(), sections: [{ start: 0, end: 1, label: 'chorus', energy: 0 }] })).toBeNull();
    expect(validateTrackAnalysis({ ...sample(), events: [{ t: 0, kind: 'boom', strength: 1 }] })).toBeNull();
  });

  it('rejects sections that end before they start', () => {
    expect(validateTrackAnalysis({ ...sample(), sections: [{ start: 5, end: 1, label: 'verse', energy: 0 }] })).toBeNull();
  });
});

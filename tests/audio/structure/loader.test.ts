// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadTrackAnalysis } from '../../../src/audio/structure/loader';
import { analysisUrlForTrack } from '../../../src/audio/structure/analysis';

const valid = {
  version: 1,
  trackPath: '/audio/x.mp3',
  duration: 1,
  bpm: 100,
  beats: [],
  downbeats: [],
  energy: [],
  sections: [],
  events: [],
};

function stubFetch(impl: (url: string) => Promise<unknown>) {
  const fn = vi.fn(impl);
  vi.stubGlobal('fetch', fn);
  return fn;
}

describe('loadTrackAnalysis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the analysis URL and returns the validated document', async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, json: async () => valid }));
    const result = await loadTrackAnalysis('/audio/x.mp3');
    expect(result).toEqual(valid);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(analysisUrlForTrack('/audio/x.mp3'));
  });

  it('returns null on a non-ok response', async () => {
    stubFetch(async () => ({ ok: false, status: 404, json: async () => ({}) }));
    expect(await loadTrackAnalysis('/audio/x.mp3')).toBeNull();
  });

  it('returns null on invalid JSON', async () => {
    stubFetch(async () => ({ ok: true, json: async () => { throw new SyntaxError('bad'); } }));
    expect(await loadTrackAnalysis('/audio/x.mp3')).toBeNull();
  });

  it('returns null on a document that fails validation', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ ...valid, version: 7 }) }));
    expect(await loadTrackAnalysis('/audio/x.mp3')).toBeNull();
  });

  it('returns null when fetch throws', async () => {
    stubFetch(async () => { throw new TypeError('network'); });
    await expect(loadTrackAnalysis('/audio/x.mp3')).resolves.toBeNull();
  });
});

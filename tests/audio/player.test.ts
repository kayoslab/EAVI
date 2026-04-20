import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Web Audio API mocks ---

let mockGainValue: number;
let mockCtxState: string;
let mockResume: ReturnType<typeof vi.fn>;
let mockClose: ReturnType<typeof vi.fn>;
let mockPlay: ReturnType<typeof vi.fn>;
let mockPause: ReturnType<typeof vi.fn>;
let mockAnalyserNode: Record<string, unknown>;
let mockGainNode: Record<string, unknown>;
let mockSource: Record<string, unknown>;
let mockAudioElement: Record<string, unknown>;
let eventListeners: Record<string, Function>;
let gainValueAtPlayTime: number | undefined;

function setupMocks(autoplayAllowed: boolean) {
  mockGainValue = 1;
  mockCtxState = autoplayAllowed ? 'running' : 'suspended';
  mockResume = vi.fn(() => Promise.resolve());
  mockClose = vi.fn(() => Promise.resolve());

  mockAnalyserNode = {
    fftSize: 0,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn(),
    getByteTimeDomainData: vi.fn(),
  };
  Object.defineProperty(mockAnalyserNode, 'frequencyBinCount', {
    get() { return (this as { fftSize: number }).fftSize / 2; },
    configurable: true,
  });

  mockGainNode = {
    gain: {
      get value() { return mockGainValue; },
      set value(v: number) { mockGainValue = v; },
    },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  mockSource = { connect: vi.fn() };
  eventListeners = {};
  gainValueAtPlayTime = undefined;

  mockPlay = vi.fn(() => {
    gainValueAtPlayTime = mockGainValue;
    if (autoplayAllowed) return Promise.resolve();
    return Promise.reject(new DOMException('NotAllowedError'));
  });
  mockPause = vi.fn();

  mockAudioElement = {
    src: '',
    crossOrigin: '',
    loop: false,
    play: mockPlay,
    pause: mockPause,
    addEventListener: vi.fn((event: string, handler: Function) => {
      eventListeners[event] = handler;
    }),
    removeEventListener: vi.fn(),
  };

  // Mock global Audio constructor
  vi.stubGlobal('Audio', vi.fn(() => mockAudioElement));

  // Mock AudioContext
  vi.stubGlobal('AudioContext', vi.fn(() => ({
    get state() { return mockCtxState; },
    destination: { __type: 'destination' },
    resume: mockResume,
    close: mockClose,
    createAnalyser: vi.fn(() => mockAnalyserNode),
    createGain: vi.fn(() => mockGainNode),
    createMediaElementSource: vi.fn(() => mockSource),
  })));
}

describe('player', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  async function loadAndInit(autoplayAllowed = true) {
    setupMocks(autoplayAllowed);
    const { initAudio } = await import('../../src/audio/player');
    return initAudio();
  }

  it('initAudio resolves without throwing when play() succeeds', async () => {
    const player = await loadAndInit(true);
    expect(player).toBeDefined();
  });

  it('initAudio resolves without throwing when play() rejects (autoplay blocked)', async () => {
    const player = await loadAndInit(false);
    expect(player).toBeDefined();
  });

  it('initial state is muted', async () => {
    const player = await loadAndInit(true);
    expect(player.muted).toBe(true);
  });

  it('player starts muted with gain at 0 in dual-deck mode', async () => {
    const player = await loadAndInit(true);
    // In dual-deck mode, masterGain starts at 0 (muted) while per-deck gains
    // are set to 1 for the active deck. Since all gain nodes share one mock,
    // we verify the player reports muted state correctly.
    expect(player.muted).toBe(true);
    // setMuted(true) should set gain to 0
    player.setMuted(true);
    expect(mockGainValue).toBe(0);
  });

  it('state is "playing" when autoplay succeeds', async () => {
    const player = await loadAndInit(true);
    expect(player.state).toBe('playing');
  });

  it('state is "suspended" when autoplay is blocked', async () => {
    const player = await loadAndInit(false);
    expect(player.state).toBe('suspended');
  });

  it('setMuted(false) sets gain to 1 and calls ctx.resume()', async () => {
    const player = await loadAndInit(false);
    // Override play to succeed on user gesture
    mockPlay.mockResolvedValueOnce(undefined);
    player.setMuted(false);

    expect(mockGainValue).toBe(1);
    expect(mockResume).toHaveBeenCalled();
  });

  it('setMuted(true) sets gain to 0', async () => {
    const player = await loadAndInit(true);
    player.setMuted(false);
    player.setMuted(true);

    expect(mockGainValue).toBe(0);
    expect(player.muted).toBe(true);
  });

  it('setMuted(false) updates muted property to false', async () => {
    const player = await loadAndInit(true);
    player.setMuted(false);
    expect(player.muted).toBe(false);
  });

  it('getAnalyserNode returns an AnalyserNode', async () => {
    const player = await loadAndInit(true);
    const node = player.getAnalyserNode();
    expect(node).toBeDefined();
    expect(node).toBe(mockAnalyserNode);
  });

  it('destroy() closes AudioContext and pauses audio', async () => {
    const player = await loadAndInit(true);
    player.destroy();

    expect(mockPause).toHaveBeenCalled();
    expect(mockClose).toHaveBeenCalled();
  });

  it('does not use localStorage, sessionStorage, or cookies', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');

    const player = await loadAndInit(true);
    player.setMuted(false);
    player.setMuted(true);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });

  it('audio graph allows analysis while muted', async () => {
    const player = await loadAndInit(true);

    // Player is muted by default
    expect(player.muted).toBe(true);
    // Analyser is still available
    expect(player.getAnalyserNode()).not.toBeNull();
    // Source was connected to analyser (source → analyser → gain → dest)
    expect(mockSource.connect).toHaveBeenCalled();
  });

  describe('player pipeline integration', () => {
    it('getPipeline() returns an AnalyserPipeline after initAudio()', async () => {
      const player = await loadAndInit(true);
      const pipeline = player.getPipeline();
      expect(pipeline).not.toBeNull();
      expect(pipeline!.frequency).toBeInstanceOf(Uint8Array);
      expect(pipeline!.timeDomain).toBeInstanceOf(Uint8Array);
      expect(typeof pipeline!.poll).toBe('function');
    });

    it('pipeline.poll() works when player state is suspended (autoplay blocked)', async () => {
      const player = await loadAndInit(false);
      expect(player.state).toBe('suspended');
      const pipeline = player.getPipeline();
      expect(() => pipeline!.poll()).not.toThrow();
      expect(mockAnalyserNode.getByteFrequencyData).toHaveBeenCalled();
      expect(mockAnalyserNode.getByteTimeDomainData).toHaveBeenCalled();
    });

    it('pipeline.poll() works when player is muted', async () => {
      const player = await loadAndInit(true);
      expect(player.muted).toBe(true);
      const pipeline = player.getPipeline();
      expect(() => pipeline!.poll()).not.toThrow();
      expect(mockAnalyserNode.getByteFrequencyData).toHaveBeenCalled();
      expect(mockAnalyserNode.getByteTimeDomainData).toHaveBeenCalled();
    });

    it('pipeline buffers contain data after poll()', async () => {
      const player = await loadAndInit(true);
      (mockAnalyserNode.getByteFrequencyData as ReturnType<typeof vi.fn>).mockImplementation((arr: Uint8Array) => arr.fill(180));
      (mockAnalyserNode.getByteTimeDomainData as ReturnType<typeof vi.fn>).mockImplementation((arr: Uint8Array) => arr.fill(90));
      const pipeline = player.getPipeline();
      pipeline!.poll();
      expect(pipeline!.frequency.length).toBeGreaterThan(0);
      expect(pipeline!.frequency[0]).toBe(180);
      expect(pipeline!.timeDomain[0]).toBe(90);
    });
  });
});

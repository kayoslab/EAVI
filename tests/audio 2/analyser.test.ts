import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalyser, getFrequencyData, getTimeDomainData, createPipeline } from '../../src/audio/analyser';

// Minimal Web Audio API mocks
function createMockAudioContext() {
  const destination = { __type: 'destination' };

  const mockAnalyser = {
    fftSize: 0,
    frequencyBinCount: 0,
    smoothingTimeConstant: 0,
    connect: vi.fn(),
    disconnect: vi.fn(),
    getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(128)),
    getByteTimeDomainData: vi.fn((arr: Uint8Array) => arr.fill(128)),
  };

  // Make frequencyBinCount derive from fftSize
  Object.defineProperty(mockAnalyser, 'frequencyBinCount', {
    get() {
      return this.fftSize / 2;
    },
  });

  const mockGainNode = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };

  return {
    destination,
    createAnalyser: vi.fn(() => mockAnalyser),
    createGain: vi.fn(() => mockGainNode),
    _mockAnalyser: mockAnalyser,
    _mockGainNode: mockGainNode,
  } as unknown as AudioContext & {
    _mockAnalyser: typeof mockAnalyser;
    _mockGainNode: typeof mockGainNode;
  };
}

describe('analyser', () => {
  let ctx: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    ctx = createMockAudioContext();
  });

  it('createAnalyser returns analyser, gainNode, and connectSource', () => {
    const result = createAnalyser(ctx);
    expect(result.analyser).toBeDefined();
    expect(result.gainNode).toBeDefined();
    expect(typeof result.connectSource).toBe('function');
  });

  it('connectSource wires source through analyser to gain to destination', () => {
    const result = createAnalyser(ctx);
    const mockSource = { connect: vi.fn() } as unknown as AudioNode;

    result.connectSource(mockSource);

    // source → analyser
    expect(mockSource.connect).toHaveBeenCalledWith(result.analyser);
    // analyser → gainNode
    expect(ctx._mockAnalyser.connect).toHaveBeenCalledWith(result.gainNode);
    // gainNode → destination
    expect(ctx._mockGainNode.connect).toHaveBeenCalledWith(ctx.destination);
  });

  it('analyser has expected fftSize', () => {
    const result = createAnalyser(ctx);
    expect([1024, 2048]).toContain(result.analyser.fftSize);
  });

  it('getFrequencyData returns Uint8Array of correct length', () => {
    const result = createAnalyser(ctx);
    const data = getFrequencyData(result.analyser);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(result.analyser.frequencyBinCount);
  });

  it('getTimeDomainData returns Uint8Array of correct length', () => {
    const result = createAnalyser(ctx);
    const data = getTimeDomainData(result.analyser);
    expect(data).toBeInstanceOf(Uint8Array);
    expect(data.length).toBe(result.analyser.frequencyBinCount);
  });

  it('does not access localStorage, sessionStorage, or cookies', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');

    const result = createAnalyser(ctx);
    const mockSource = { connect: vi.fn() } as unknown as AudioNode;
    result.connectSource(mockSource);
    getFrequencyData(result.analyser);
    getTimeDomainData(result.analyser);

    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

describe('AnalyserPipeline', () => {
  let ctx: ReturnType<typeof createMockAudioContext>;

  beforeEach(() => {
    ctx = createMockAudioContext();
  });

  it('createPipeline returns an object with frequency, timeDomain buffers and poll method', () => {
    const result = createAnalyser(ctx);
    const pipeline = createPipeline(result.analyser);
    expect(pipeline.frequency).toBeInstanceOf(Uint8Array);
    expect(pipeline.timeDomain).toBeInstanceOf(Uint8Array);
    expect(typeof pipeline.poll).toBe('function');
  });

  it('pipeline buffers have length equal to frequencyBinCount', () => {
    const result = createAnalyser(ctx);
    const pipeline = createPipeline(result.analyser);
    expect(pipeline.frequency.length).toBe(result.analyser.frequencyBinCount);
    expect(pipeline.timeDomain.length).toBe(result.analyser.frequencyBinCount);
  });

  it('poll() populates frequency and timeDomain buffers in place', () => {
    const result = createAnalyser(ctx);
    ctx._mockAnalyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => arr.fill(200));
    ctx._mockAnalyser.getByteTimeDomainData.mockImplementation((arr: Uint8Array) => arr.fill(100));
    const pipeline = createPipeline(result.analyser);
    pipeline.poll();
    expect(pipeline.frequency[0]).toBe(200);
    expect(pipeline.timeDomain[0]).toBe(100);
    expect(ctx._mockAnalyser.getByteFrequencyData).toHaveBeenCalledWith(pipeline.frequency);
    expect(ctx._mockAnalyser.getByteTimeDomainData).toHaveBeenCalledWith(pipeline.timeDomain);
  });

  it('poll() returns the same buffer references on every call (no per-frame allocation)', () => {
    const result = createAnalyser(ctx);
    const pipeline = createPipeline(result.analyser);
    const freqRef = pipeline.frequency;
    const timeRef = pipeline.timeDomain;
    pipeline.poll();
    expect(pipeline.frequency).toBe(freqRef);
    pipeline.poll();
    expect(pipeline.frequency).toBe(freqRef);
    expect(pipeline.timeDomain).toBe(timeRef);
  });

  it('poll() is callable multiple times simulating per-frame usage', () => {
    const result = createAnalyser(ctx);
    const pipeline = createPipeline(result.analyser);
    for (let i = 0; i < 60; i++) {
      pipeline.poll();
    }
    expect(ctx._mockAnalyser.getByteFrequencyData).toHaveBeenCalledTimes(60);
    expect(ctx._mockAnalyser.getByteTimeDomainData).toHaveBeenCalledTimes(60);
  });

  it('pipeline works independently of gain/mute state', () => {
    const result = createAnalyser(ctx);
    ctx._mockGainNode.gain.value = 0; // simulate muted
    ctx._mockAnalyser.getByteFrequencyData.mockImplementation((arr: Uint8Array) => arr.fill(150));
    ctx._mockAnalyser.getByteTimeDomainData.mockImplementation((arr: Uint8Array) => arr.fill(120));
    const pipeline = createPipeline(result.analyser);
    pipeline.poll();
    expect(pipeline.frequency[0]).toBe(150);
    expect(pipeline.timeDomain[0]).toBe(120);
  });

  it('pipeline does not access localStorage, sessionStorage, or cookies', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');
    const result = createAnalyser(ctx);
    const pipeline = createPipeline(result.analyser);
    pipeline.poll();
    pipeline.poll();
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAnalyser, getFrequencyData, getTimeDomainData } from '../../src/audio/analyser';

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

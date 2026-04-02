// Vitest test setup

// jsdom does not provide AudioContext — stub it to prevent unhandled rejections
if (typeof globalThis.AudioContext === 'undefined') {
  (globalThis as Record<string, unknown>).AudioContext = class AudioContext {
    state = 'suspended';
    createAnalyser() { return { connect: () => {}, fftSize: 0, frequencyBinCount: 0, getByteFrequencyData: () => {}, getByteTimeDomainData: () => {} }; }
    createGain() { return { connect: () => {}, gain: { value: 1 } }; }
    decodeAudioData() { return Promise.resolve({}); }
    createBufferSource() { return { connect: () => {}, start: () => {}, stop: () => {}, buffer: null }; }
    createMediaElementSource() { return { connect: () => {} }; }
    resume() { return Promise.resolve(); }
  };
}

// jsdom does not implement canvas getContext — provide a minimal 2d context mock
const originalCreateElement = document.createElement.bind(document);
document.createElement = ((tagName: string, options?: ElementCreationOptions) => {
  const el = originalCreateElement(tagName, options);
  if (tagName.toLowerCase() === 'canvas') {
    (el as HTMLCanvasElement).getContext = (() => {
      return {
        fillStyle: '',
        fillRect: () => {},
        clearRect: () => {},
        getImageData: () => ({ data: [] }),
        putImageData: () => {},
        createImageData: () => ({ data: [] }),
        setTransform: () => {},
        drawImage: () => {},
        save: () => {},
        restore: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        stroke: () => {},
        fill: () => {},
        translate: () => {},
        scale: () => {},
        rotate: () => {},
        arc: () => {},
        measureText: () => ({ width: 0 }),
        canvas: el,
      };
    }) as unknown as typeof el.getContext;
  }
  return el;
}) as typeof document.createElement;

// Three.js WebGLRenderer mock for jsdom (no real WebGL context available)
// This mock is used via vi.mock('three') in test files that need it.
// For tests that import Three.js directly, the mock provides minimal working stubs.

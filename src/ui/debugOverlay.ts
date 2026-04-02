export interface DebugFrameData {
  fps: number;
  modeName: string;
  pointCount: number;
  bass: number;
  treble: number;
}

export function createDebugOverlay(): {
  element: HTMLElement;
  update: (data: DebugFrameData) => void;
} {
  const el = document.createElement('div');
  el.className = 'eavi-debug-overlay';

  let lastUpdate = -1;

  const update = (data: DebugFrameData) => {
    const now = performance.now();
    if (now === lastUpdate) return;
    lastUpdate = now;

    const fps = Math.round(data.fps);
    const bass = Math.round(data.bass);
    const treble = Math.round(data.treble);

    el.textContent =
      `FPS: ${fps} | mode: ${data.modeName}\n` +
      `points: ${data.pointCount} | bass: ${bass} | treble: ${treble}`;
  };

  return { element: el, update };
}

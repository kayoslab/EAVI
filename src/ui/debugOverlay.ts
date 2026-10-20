export interface DebugFrameData {
  fps: number;
  recipe: string;
  tier: string;
  pointCount: number;
  bass: number;
  treble: number;
  beat: number;
  health: 'pass' | 'fail' | 'pending';
  errors: number;
  size: readonly [number, number];
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
    if (now - lastUpdate < 100) return;
    lastUpdate = now;
    el.textContent =
      `fps ${Math.round(data.fps)} | ${data.recipe} | tier ${data.tier} | ${data.size[0]}x${data.size[1]}\n` +
      `points ${data.pointCount} | bass ${Math.round(data.bass)} | treble ${Math.round(data.treble)} | beat ${data.beat.toFixed(2)}\n` +
      `health ${data.health} | errors ${data.errors}`;
  };

  return { element: el, update };
}

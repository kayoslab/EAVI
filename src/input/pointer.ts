export interface PointerState {
  x: number;
  y: number;
  dx: number;
  dy: number;
  speed: number;
  active: boolean;
}

const DEFAULT_STATE: PointerState = {
  x: 0.5,
  y: 0.5,
  dx: 0,
  dy: 0,
  speed: 0,
  active: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function initPointer(target: HTMLElement): {
  getState(): PointerState;
  destroy(): void;
} {
  let state: PointerState = { ...DEFAULT_STATE };
  let hasMoved = false;

  function onPointerMove(e: PointerEvent) {
    const nx = clamp(e.clientX / window.innerWidth, 0, 1);
    const ny = clamp(e.clientY / window.innerHeight, 0, 1);

    const dx = hasMoved ? nx - state.x : 0;
    const dy = hasMoved ? ny - state.y : 0;

    state = {
      x: nx,
      y: ny,
      dx,
      dy,
      speed: Math.sqrt(dx * dx + dy * dy),
      active: state.active,
    };
    hasMoved = true;
  }

  function onPointerEnter() {
    state = { ...state, active: true };
  }

  function onPointerLeave() {
    state = { ...state, active: false };
  }

  const opts: AddEventListenerOptions = { passive: true };
  target.addEventListener('pointermove', onPointerMove, opts);
  target.addEventListener('pointerenter', onPointerEnter, opts);
  target.addEventListener('pointerleave', onPointerLeave, opts);

  return {
    getState(): PointerState {
      return { ...state };
    },
    destroy() {
      target.removeEventListener('pointermove', onPointerMove);
      target.removeEventListener('pointerenter', onPointerEnter);
      target.removeEventListener('pointerleave', onPointerLeave);
    },
  };
}

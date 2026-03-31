import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { initPointer } from '../src/input/pointer';

// jsdom lacks PointerEvent — polyfill as subclass of MouseEvent
if (typeof globalThis.PointerEvent === 'undefined') {
  (globalThis as any).PointerEvent = class PointerEvent extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    constructor(type: string, init: PointerEventInit & MouseEventInit = {}) {
      super(type, init);
      this.pointerId = (init as any).pointerId ?? 0;
      this.pointerType = (init as any).pointerType ?? '';
    }
  };
}

function pointerEvent(
  type: string,
  opts: Partial<PointerEventInit & { clientX: number; clientY: number }> = {},
): PointerEvent {
  return new PointerEvent(type, { bubbles: true, ...opts });
}

describe('US-006: Track runtime pointer entropy', () => {
  let target: HTMLDivElement;

  beforeEach(() => {
    target = document.createElement('div');
    document.body.appendChild(target);
    Object.defineProperty(window, 'innerWidth', { value: 1000, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, writable: true, configurable: true });
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('returns default state before any pointer movement', () => {
    const { getState, destroy } = initPointer(target);
    const s = getState();
    expect(s.x).toBe(0.5);
    expect(s.y).toBe(0.5);
    expect(s.dx).toBe(0);
    expect(s.dy).toBe(0);
    expect(s.speed).toBe(0);
    expect(s.active).toBe(false);
    destroy();
  });

  it('tracks normalized pointer position on pointermove', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 400 }));
    expect(getState().x).toBe(0.5);
    expect(getState().y).toBe(0.5);
    destroy();
  });

  it('computes dx and dy from consecutive moves', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 160 }));
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 400 }));
    const s = getState();
    expect(s.dx).toBeCloseTo(0.3, 5);
    expect(s.dy).toBeCloseTo(0.3, 5);
    destroy();
  });

  it('computes speed as magnitude of delta vector', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 160 }));
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 400 }));
    const s = getState();
    expect(s.speed).toBeCloseTo(Math.sqrt(0.3 ** 2 + 0.3 ** 2), 5);
    destroy();
  });

  it('handles touch input via pointerType touch', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(
      pointerEvent('pointermove', { clientX: 700, clientY: 200, pointerType: 'touch' }),
    );
    expect(getState().x).toBeCloseTo(0.7, 5);
    expect(getState().y).toBeCloseTo(0.25, 5);
    destroy();
  });

  it('normalizes coordinates to 0-1 range at viewport edges', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 0, clientY: 0 }));
    expect(getState().x).toBe(0);
    expect(getState().y).toBe(0);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 1000, clientY: 800 }));
    expect(getState().x).toBe(1);
    expect(getState().y).toBe(1);
    destroy();
  });

  it('clamps coordinates that exceed viewport bounds', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: -50, clientY: -50 }));
    expect(getState().x).toBe(0);
    expect(getState().y).toBe(0);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 2000, clientY: 1600 }));
    expect(getState().x).toBe(1);
    expect(getState().y).toBe(1);
    destroy();
  });

  it('destroy removes event listeners', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 300, clientY: 240 }));
    const before = getState();
    destroy();
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 700, clientY: 600 }));
    const after = getState();
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
  });

  it('does not use localStorage or sessionStorage', () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const { destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
    destroy();
  });

  it('does not set cookies', () => {
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');
    const { destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(cookieSpy).not.toHaveBeenCalled();
    cookieSpy.mockRestore();
    destroy();
  });

  it('does not access indexedDB', () => {
    const fakeOpen = vi.fn();
    const originalIDB = globalThis.indexedDB;
    (globalThis as any).indexedDB = { open: fakeOpen };
    const { destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 100, clientY: 100 }));
    expect(fakeOpen).not.toHaveBeenCalled();
    (globalThis as any).indexedDB = originalIDB;
    destroy();
  });

  it('tracks active state on pointerenter and pointerleave', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointerenter'));
    expect(getState().active).toBe(true);
    target.dispatchEvent(pointerEvent('pointerleave'));
    expect(getState().active).toBe(false);
    destroy();
  });

  it('dx and dy are zero on the first move', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 400, clientY: 300 }));
    expect(getState().dx).toBe(0);
    expect(getState().dy).toBe(0);
    destroy();
  });

  it('getState returns a snapshot not a live reference', () => {
    const { getState, destroy } = initPointer(target);
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 200, clientY: 160 }));
    const snapshot = getState();
    target.dispatchEvent(pointerEvent('pointermove', { clientX: 500, clientY: 400 }));
    expect(snapshot.x).toBeCloseTo(0.2, 5);
    expect(snapshot.y).toBeCloseTo(0.2, 5);
    expect(getState().x).toBeCloseTo(0.5, 5);
    destroy();
  });
});

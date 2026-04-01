import { describe, it, expect } from 'vitest';
import { attachResizeHandler } from '../../src/visual/resize';

describe('US-025: Resolution scaling in resize handler', () => {
  it('T-025-20: resize handler applies resolutionScale to new canvas dimensions', () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    attachResizeHandler(canvas, ctx, 0.5);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(384);
  });

  it('T-025-21: resize handler defaults to full resolution when no scale provided', () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;
    attachResizeHandler(canvas, ctx);

    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    window.dispatchEvent(new Event('resize'));

    expect(canvas.width).toBe(1024);
    expect(canvas.height).toBe(768);
  });
});

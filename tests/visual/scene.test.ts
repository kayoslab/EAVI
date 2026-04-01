import { describe, it, expect, vi } from 'vitest';
import { initScene } from '../../src/visual/scene';

describe('US-025: Resolution scaling in initScene', () => {
  it('T-025-17: initScene with resolutionScale=0.5 creates half-resolution canvas', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    const container = document.createElement('div');
    const { canvas } = initScene(container, 0.5);
    expect(canvas.width).toBe(960);
    expect(canvas.height).toBe(540);
  });

  it('T-025-18: initScene with default resolutionScale uses full resolution', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    const container = document.createElement('div');
    const { canvas } = initScene(container);
    expect(canvas.width).toBe(1920);
    expect(canvas.height).toBe(1080);
  });

  it('T-025-19: initScene with resolutionScale=0.75 produces correctly scaled canvas', () => {
    Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    const container = document.createElement('div');
    const { canvas } = initScene(container, 0.75);
    expect(canvas.width).toBe(1440);
    expect(canvas.height).toBe(810);
  });
});

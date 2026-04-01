import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('US-001: Canvas container', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('renders a <canvas> element inside #app', async () => {
    await import('../src/main');
    const canvas = document.querySelector('#app canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.tagName.toLowerCase()).toBe('canvas');
  });

  it('canvas has non-zero dimensions', async () => {
    // jsdom defaults innerWidth/innerHeight to 0; set them for the test
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
    await import('../src/main');
    const canvas = document.querySelector('#app canvas') as HTMLCanvasElement | null;
    expect(canvas).not.toBeNull();
    expect(canvas!.width).toBeGreaterThan(0);
    expect(canvas!.height).toBeGreaterThan(0);
  });

  it('updates canvas size on window resize', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 768, writable: true });
    await import('../src/main');
    const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
    expect(canvas).not.toBeNull();

    Object.defineProperty(window, 'innerWidth', { value: 800 });
    Object.defineProperty(window, 'innerHeight', { value: 600 });
    window.dispatchEvent(new Event('resize'));

    // Quality scaling may reduce canvas buffer size below viewport
    expect(canvas.width).toBeLessThanOrEqual(800);
    expect(canvas.height).toBeLessThanOrEqual(600);
    expect(canvas.width).toBeGreaterThan(0);
    expect(canvas.height).toBeGreaterThan(0);
  });
});

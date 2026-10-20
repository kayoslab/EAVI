import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * jsdom has no navigator.gpu, so the boot path must take the static-message branch:
 * no canvas, no audio, no pointer tracking — only the unsupported page inside #app.
 */
describe('US-001 (v2): boot without WebGPU renders the static page', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('renders the unsupported page inside #app and no canvas', async () => {
    await import('../src/main');
    await vi.waitFor(() => {
      expect(document.querySelector('#app .eavi-unsupported')).not.toBeNull();
    });
    expect(document.querySelector('canvas')).toBeNull();
  });

  it('names the piece and the WebGPU requirement', async () => {
    await import('../src/main');
    await vi.waitFor(() => {
      expect(document.querySelector('#app .eavi-unsupported')).not.toBeNull();
    });
    const text = document.querySelector('#app')!.textContent ?? '';
    expect(text).toContain('EAVI');
    expect(text).toMatch(/WebGPU/);
  });

  it('does not mount the mute button or track display without a device', async () => {
    await import('../src/main');
    await vi.waitFor(() => {
      expect(document.querySelector('#app .eavi-unsupported')).not.toBeNull();
    });
    expect(document.querySelector('.eavi-mute-btn, [aria-label*="mute" i]')).toBeNull();
  });
});

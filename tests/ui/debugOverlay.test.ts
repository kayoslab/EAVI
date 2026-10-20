import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DebugFrameData } from '../../src/ui/debugOverlay';

const sample: DebugFrameData = {
  fps: 59.874, recipe: 'spike:menger+lorenz', tier: 'high', pointCount: 400000,
  bass: 142.7, treble: 38.3, beat: 0.5, health: 'pass', errors: 0, size: [1920, 1080],
};

describe('Debug overlay (v2)', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('returns an element with the overlay class and an update function', async () => {
    const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
    const overlay = createDebugOverlay();
    expect(overlay.element).toBeInstanceOf(HTMLElement);
    expect(overlay.element.classList.contains('eavi-debug-overlay')).toBe(true);
    expect(typeof overlay.update).toBe('function');
  });

  it('displays rounded fps, recipe, tier, size, point count, bands, health and error count', async () => {
    const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
    const overlay = createDebugOverlay();
    overlay.update(sample);
    const text = overlay.element.textContent ?? '';
    expect(text).toMatch(/fps 60/);
    expect(text).toContain('spike:menger+lorenz');
    expect(text).toContain('tier high');
    expect(text).toContain('1920x1080');
    expect(text).toContain('points 400000');
    expect(text).toContain('bass 143');
    expect(text).toContain('treble 38');
    expect(text).toContain('beat 0.50');
    expect(text).toContain('health pass');
    expect(text).toContain('errors 0');
  });

  it('shows a failing health gate', async () => {
    const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
    const overlay = createDebugOverlay();
    overlay.update({ ...sample, health: 'fail', errors: 2 });
    const text = overlay.element.textContent ?? '';
    expect(text).toContain('health fail');
    expect(text).toContain('errors 2');
  });

  it('throttles updates to roughly ten per second', async () => {
    const { createDebugOverlay } = await import('../../src/ui/debugOverlay');
    const overlay = createDebugOverlay();
    const nowSpy = vi.spyOn(performance, 'now');
    nowSpy.mockReturnValue(1000);
    overlay.update(sample);
    nowSpy.mockReturnValue(1050);
    overlay.update({ ...sample, recipe: 'skipped' });
    expect(overlay.element.textContent).toContain('spike:menger+lorenz');
    nowSpy.mockReturnValue(1150);
    overlay.update({ ...sample, recipe: 'applied' });
    expect(overlay.element.textContent).toContain('applied');
    nowSpy.mockRestore();
  });
});

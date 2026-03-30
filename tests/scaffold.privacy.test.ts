import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('US-001: No forbidden storage APIs', () => {
  beforeEach(() => {
    vi.resetModules();
    document.body.innerHTML = '<div id="app"></div>';
  });

  it('does not access localStorage', async () => {
    const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    await import('../src/main');
    expect(getItemSpy).not.toHaveBeenCalled();
    expect(setItemSpy).not.toHaveBeenCalled();
    getItemSpy.mockRestore();
    setItemSpy.mockRestore();
  });

  it('does not set cookies', async () => {
    const cookieSpy = vi.spyOn(document, 'cookie', 'set');
    await import('../src/main');
    expect(cookieSpy).not.toHaveBeenCalled();
    cookieSpy.mockRestore();
  });
});

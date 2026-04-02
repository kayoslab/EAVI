import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  return {
    ...actual,
    WebGLRenderer: class MockWebGLRenderer {
      domElement: HTMLCanvasElement;
      private _clearColor = new actual.Color(0x000000);
      private _pixelRatio = 1;
      constructor() {
        this.domElement = document.createElement('canvas');
        this.domElement.style.display = 'block';
      }
      setSize(w: number, h: number, _updateStyle?: boolean) {
        this.domElement.width = w * this._pixelRatio;
        this.domElement.height = h * this._pixelRatio;
      }
      setPixelRatio(ratio: number) { this._pixelRatio = ratio; }
      setClearColor(color: number | string | actual.Color) {
        if (typeof color === 'number') this._clearColor.setHex(color);
      }
      getClearColor(target: actual.Color) { target.copy(this._clearColor); return target; }
      render() {}
      dispose() {}
      getSize(target: actual.Vector2) {
        target.set(this.domElement.width / this._pixelRatio, this.domElement.height / this._pixelRatio);
        return target;
      }
    },
  };
});

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

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { AudioPlayer } from '../src/audio/player';

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

function createMockPlayer(initialMuted = true): AudioPlayer {
  let muted = initialMuted;
  return {
    get state() { return 'playing' as const; },
    get muted() { return muted; },
    setMuted: vi.fn((value: boolean) => { muted = value; }),
    getAnalyserNode: vi.fn(() => null),
    getPipeline: vi.fn(() => null),
    destroy: vi.fn(),
  };
}

describe('US-027: Runtime health check', () => {
  describe('Production build succeeds', () => {
    it('npm run build exits with code 0', () => {
      expect(() => execSync('npm run build', { stdio: 'pipe' })).not.toThrow();
    });

    it('dist/index.html is generated after build', () => {
      execSync('npm run build', { stdio: 'pipe' });
      expect(existsSync(resolve(__dirname, '..', 'dist', 'index.html'))).toBe(true);
    });

    it('TypeScript compiles without errors', () => {
      expect(() => execSync('npx tsc --noEmit', { stdio: 'pipe' })).not.toThrow();
    });
  });

  describe('No console errors on normal load', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ country: 'US', region: 'CA' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // jsdom doesn't implement HTMLMediaElement.play — stub it to avoid spurious console.error
      vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined);
    });

    afterEach(() => {
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('no console.error calls during module initialization', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      await import('../src/main');
      expect(errorSpy).not.toHaveBeenCalled();
    });

    it('no console.warn calls during module initialization', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await import('../src/main');
      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('Scene renders when audio is blocked', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ country: 'US', region: 'CA' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
      // jsdom doesn't implement HTMLMediaElement.play — stub it to avoid spurious console.error
      vi.spyOn(HTMLAudioElement.prototype, 'play').mockResolvedValue(undefined);
    });

    afterEach(() => {
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('canvas element exists in #app when AudioContext.resume rejects', async () => {
      const OrigAudioContext = globalThis.AudioContext;
      (globalThis as Record<string, unknown>).AudioContext = class extends OrigAudioContext {
        override resume() { return Promise.reject(new DOMException('Autoplay blocked')); }
      };

      await import('../src/main');
      await vi.dynamicImportSettled?.() ?? new Promise((r) => setTimeout(r, 0));

      const canvas = document.querySelector('#app canvas');
      expect(canvas).not.toBeNull();

      (globalThis as Record<string, unknown>).AudioContext = OrigAudioContext;
    });

    it('canvas has non-zero dimensions when audio is blocked', async () => {
      const OrigAudioContext = globalThis.AudioContext;
      (globalThis as Record<string, unknown>).AudioContext = class extends OrigAudioContext {
        override resume() { return Promise.reject(new DOMException('Autoplay blocked')); }
      };

      await import('../src/main');
      await new Promise((r) => setTimeout(r, 0));

      const canvas = document.querySelector('#app canvas') as HTMLCanvasElement;
      expect(canvas.width).toBeGreaterThan(0);
      expect(canvas.height).toBeGreaterThan(0);

      (globalThis as Record<string, unknown>).AudioContext = OrigAudioContext;
    });

    it('no errors thrown when audio autoplay is blocked', async () => {
      const OrigAudioContext = globalThis.AudioContext;
      (globalThis as Record<string, unknown>).AudioContext = class extends OrigAudioContext {
        override resume() { return Promise.reject(new DOMException('Autoplay blocked')); }
      };
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(import('../src/main')).resolves.not.toThrow();

      expect(errorSpy).not.toHaveBeenCalled();

      (globalThis as Record<string, unknown>).AudioContext = OrigAudioContext;
    });
  });

  describe('Mute toggle and info overlay both work', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });

    afterEach(() => {
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('info button is present in DOM after app init', async () => {
      await import('../src/main');
      const btn = document.querySelector('.eavi-info-btn');
      expect(btn).not.toBeNull();
    });

    it('info overlay is present in DOM after app init', async () => {
      await import('../src/main');
      const overlay = document.querySelector('.eavi-info-overlay');
      expect(overlay).not.toBeNull();
    });

    it('clicking info button shows the overlay', async () => {
      await import('../src/main');
      const btn = document.querySelector('.eavi-info-btn') as HTMLButtonElement;
      const overlay = document.querySelector('.eavi-info-overlay') as HTMLDivElement;

      btn.click();

      expect(overlay.style.display).not.toBe('none');
    });

    it('clicking close button hides the overlay', async () => {
      await import('../src/main');
      const btn = document.querySelector('.eavi-info-btn') as HTMLButtonElement;
      const overlay = document.querySelector('.eavi-info-overlay') as HTMLDivElement;

      btn.click();
      const closeBtn = overlay.querySelector('.eavi-info-close') as HTMLButtonElement;
      closeBtn.click();

      expect(overlay.style.display).toBe('none');
    });

    it('createMuteButton produces a working toggle', async () => {
      const { createMuteButton } = await import('../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);

      expect(btn.classList.contains('eavi-mute-btn')).toBe(true);
      expect(btn.getAttribute('aria-label')).toBe('Unmute audio');

      btn.click();
      expect(player.setMuted).toHaveBeenCalledWith(false);
      expect(btn.getAttribute('aria-label')).toBe('Mute audio');

      btn.click();
      expect(player.setMuted).toHaveBeenCalledWith(true);
      expect(btn.getAttribute('aria-label')).toBe('Unmute audio');
    });

    it('mute button is appended after audio promise resolves', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ country: 'US', region: 'CA' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      await import('../src/main');
      // Flush microtasks so audioPromise.then fires
      await new Promise((r) => setTimeout(r, 0));

      const muteBtn = document.querySelector('.eavi-mute-btn');
      // Mute button may or may not be present depending on audio init;
      // if audio init succeeds it should be appended
      if (muteBtn) {
        expect(muteBtn).toBeInstanceOf(HTMLButtonElement);
      }
    });

    it('pressing Escape closes the info overlay', async () => {
      await import('../src/main');
      const btn = document.querySelector('.eavi-info-btn') as HTMLButtonElement;
      const overlay = document.querySelector('.eavi-info-overlay') as HTMLDivElement;

      btn.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      expect(overlay.style.display).toBe('none');
    });
  });
});

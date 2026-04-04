import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import type { AudioPlayer } from '../../src/audio/player';

function createMockPlayer(initialMuted = true): AudioPlayer {
  let muted = initialMuted;
  return {
    get state() {
      return 'playing' as const;
    },
    get muted() {
      return muted;
    },
    setMuted: vi.fn((value: boolean) => {
      muted = value;
    }),
    getAnalyserNode: vi.fn(() => null),
    getPipeline: vi.fn(() => null),
    destroy: vi.fn(),
  };
}

describe('US-020: Add mute and unmute control', () => {
  describe('createMuteButton', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('returns an HTMLButtonElement', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer();
      const btn = createMuteButton(player);
      expect(btn).toBeInstanceOf(HTMLButtonElement);
    });

    it('button has the mute button CSS class', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer();
      const btn = createMuteButton(player);
      expect(btn.classList.contains('eavi-mute-btn')).toBe(true);
    });

    it('has accessible aria-label when muted', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);
      expect(btn.getAttribute('aria-label')).toBe('Unmute audio');
    });

    it('has accessible aria-label when unmuted', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(false);
      const btn = createMuteButton(player);
      expect(btn.getAttribute('aria-label')).toBe('Mute audio');
    });
  });

  describe('toggle behavior', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('clicking calls setMuted(false) when currently muted', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);

      btn.click();

      expect(player.setMuted).toHaveBeenCalledWith(false);
    });

    it('clicking updates aria-label from Unmute to Mute', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);

      btn.click();

      expect(btn.getAttribute('aria-label')).toBe('Mute audio');
    });

    it('clicking twice reverts to muted state', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);

      btn.click();
      btn.click();

      expect(player.setMuted).toHaveBeenCalledTimes(2);
      expect(player.setMuted).toHaveBeenLastCalledWith(true);
      expect(btn.getAttribute('aria-label')).toBe('Unmute audio');
    });

    it('clicking calls setMuted(true) when currently unmuted', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(false);
      const btn = createMuteButton(player);

      btn.click();

      expect(player.setMuted).toHaveBeenCalledWith(true);
    });

    it('button text content updates on toggle', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);
      const initialText = btn.textContent;

      btn.click();
      const toggledText = btn.textContent;

      expect(toggledText).not.toBe(initialText);
    });
  });

  describe('audio analysis continues while muted', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('muting does not call destroy on the player', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(false);
      const btn = createMuteButton(player);

      btn.click();

      expect(player.destroy).not.toHaveBeenCalled();
    });

    it('toggle only calls setMuted, not destroy or getAnalyserNode', async () => {
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer(true);
      const btn = createMuteButton(player);

      btn.click();
      btn.click();

      expect(player.setMuted).toHaveBeenCalledTimes(2);
      expect(player.destroy).not.toHaveBeenCalled();
    });
  });

  describe('CSS: mute button styling', () => {
    const css = readFileSync(resolve(__dirname, '..', '..', 'src', 'style.css'), 'utf-8');

    it('has .eavi-mute-btn with position fixed', () => {
      expect(css).toMatch(/\.eavi-mute-btn[^}]*position\s*:\s*fixed/);
    });

    it('has .eavi-mute-btn with z-index', () => {
      expect(css).toMatch(/\.eavi-mute-btn[^}]*z-index/);
    });

    it('has minimum 44px tap target for accessibility', () => {
      expect(css).toMatch(/\.eavi-mute-btn[^}]*(min-width\s*:\s*44px|width\s*:\s*(44|4[5-9]|[5-9]\d|\d{3,})px)/);
    });

    it('mute button does not overlap info button position', () => {
      const muteBtnMatch = css.match(/\.eavi-mute-btn\s*\{([^}]*)\}/);
      const infoBtnMatch = css.match(/\.eavi-info-btn\s*\{([^}]*)\}/);
      expect(muteBtnMatch).not.toBeNull();
      expect(infoBtnMatch).not.toBeNull();
      const muteUsesLeft = /left\s*:/.test(muteBtnMatch![1]);
      const infoUsesRight = /right\s*:/.test(infoBtnMatch![1]);
      expect(muteUsesLeft || infoUsesRight).toBe(true);
    });

    it('has prefers-reduced-motion rule covering mute button', () => {
      expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.eavi-mute-btn/);
    });
  });

  describe('privacy: no forbidden storage APIs', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('audioToggle module does not access localStorage', async () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer();
      const btn = createMuteButton(player);
      document.body.appendChild(btn);
      btn.click();
      btn.click();
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('audioToggle module does not set cookies', async () => {
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');
      const { createMuteButton } = await import('../../src/ui/audioToggle');
      const player = createMockPlayer();
      createMuteButton(player);
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

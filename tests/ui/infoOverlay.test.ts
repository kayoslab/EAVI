import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-021: Add info button shell', () => {
  describe('createInfoButton', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('returns an HTMLButtonElement', async () => {
      const { createInfoButton } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      expect(btn).toBeInstanceOf(HTMLButtonElement);
    });

    it('button has accessible label', async () => {
      const { createInfoButton } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const label = btn.getAttribute('aria-label') || btn.textContent;
      expect(label).toBeTruthy();
    });

    it('button has the info button CSS class', async () => {
      const { createInfoButton } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      expect(btn.classList.contains('eavi-info-btn')).toBe(true);
    });
  });

  describe('createInfoOverlay', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('returns an HTMLDivElement', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      expect(overlay).toBeInstanceOf(HTMLDivElement);
    });

    it('overlay is hidden by default', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      expect(overlay.style.display === 'none' || overlay.hidden === true || !overlay.classList.contains('visible')).toBe(true);
    });

    it('overlay has the overlay CSS class', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      expect(overlay.classList.contains('eavi-info-overlay')).toBe(true);
    });

    it('overlay contains a close button', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const closeBtn = overlay.querySelector('button');
      expect(closeBtn).not.toBeNull();
    });
  });

  describe('toggle behavior', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('clicking info button shows the overlay', async () => {
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);

      btn.click();

      const isVisible = overlay.style.display !== 'none' && !overlay.hidden;
      expect(isVisible).toBe(true);
    });

    it('clicking close button hides the overlay', async () => {
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);

      btn.click();
      const closeBtn = overlay.querySelector('button')!;
      closeBtn.click();

      const isHidden = overlay.style.display === 'none' || overlay.hidden === true;
      expect(isHidden).toBe(true);
    });

    it('pressing Escape closes the overlay', async () => {
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);

      btn.click();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

      const isHidden = overlay.style.display === 'none' || overlay.hidden === true;
      expect(isHidden).toBe(true);
    });

    it('clicking overlay backdrop closes the overlay', async () => {
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);

      btn.click();
      overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      const isHidden = overlay.style.display === 'none' || overlay.hidden === true;
      expect(isHidden).toBe(true);
    });

    it('overlay closes without triggering navigation or reload', async () => {
      const locationSpy = vi.spyOn(window, 'location', 'get');
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);

      btn.click();
      const closeBtn = overlay.querySelector('button')!;
      closeBtn.click();

      expect(locationSpy).not.toHaveBeenCalled();
      locationSpy.mockRestore();
    });
  });

  describe('CSS: info button styling', () => {
    const css = readFileSync(resolve(__dirname, '..', '..', 'src', 'style.css'), 'utf-8');

    it('has .eavi-info-btn with position fixed', () => {
      expect(css).toMatch(/\.eavi-info-btn[^}]*position\s*:\s*fixed/);
    });

    it('has .eavi-info-btn with z-index', () => {
      expect(css).toMatch(/\.eavi-info-btn[^}]*z-index/);
    });

    it('has minimum 44px tap target for mobile', () => {
      expect(css).toMatch(/\.eavi-info-btn[^}]*(min-width\s*:\s*44px|width\s*:\s*(44|4[5-9]|[5-9]\d|\d{3,})px)/);
    });
  });

  describe('CSS: info overlay styling', () => {
    const css = readFileSync(resolve(__dirname, '..', '..', 'src', 'style.css'), 'utf-8');

    it('has .eavi-info-overlay with position fixed', () => {
      expect(css).toMatch(/\.eavi-info-overlay[^}]*position\s*:\s*fixed/);
    });

    it('has .eavi-info-overlay covering full viewport', () => {
      expect(css).toMatch(/\.eavi-info-overlay[^}]*(width\s*:\s*100|inset\s*:\s*0)/);
    });

    it('has .eavi-info-overlay with z-index above button', () => {
      expect(css).toMatch(/\.eavi-info-overlay[^}]*z-index/);
    });
  });

  describe('main.ts integration', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
      Object.defineProperty(window, 'innerWidth', { value: 1024, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 0);
    });

    it('info button is present in DOM after app init', async () => {
      await import('../../src/main');
      const btn = document.querySelector('.eavi-info-btn');
      expect(btn).not.toBeNull();
    });

    it('info overlay is present in DOM after app init', async () => {
      await import('../../src/main');
      const overlay = document.querySelector('.eavi-info-overlay');
      expect(overlay).not.toBeNull();
    });
  });

  describe('US-022: Privacy and artwork copy', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('overlay text identifies EAVI as an art installation', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const text = overlay.textContent || '';
      expect(text).toMatch(/art\s*installation/i);
    });

    it('overlay text states no data is stored', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const text = overlay.textContent || '';
      expect(text).toMatch(/no.*(data|information).*(stored|saved|retained|collected)/i);
    });

    it('overlay text states visitor context influences the scene', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const text = overlay.textContent || '';
      expect(text).toMatch(/visitor.*(context|presence).*(influence|shape|affect)/i);
    });

    it('overlay copy stays concise (under 500 characters)', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const panel = overlay.querySelector('.eavi-info-panel');
      const closeBtn = panel?.querySelector('.eavi-info-close');
      const allText = Array.from(panel?.childNodes || [])
        .filter((node) => node !== closeBtn)
        .map((node) => node.textContent || '')
        .join('');
      expect(allText.length).toBeLessThanOrEqual(500);
    });

    it('overlay still describes EAVI as an ephemeral experience', async () => {
      const { createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const overlay = createInfoOverlay();
      const text = overlay.textContent || '';
      expect(text).toMatch(/ephemeral/i);
    });
  });

  describe('privacy: no forbidden storage APIs', () => {
    beforeEach(() => {
      vi.resetModules();
      document.body.innerHTML = '<div id="app"></div>';
    });

    it('info overlay module does not access localStorage', async () => {
      const getItemSpy = vi.spyOn(Storage.prototype, 'getItem');
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      const btn = createInfoButton();
      const overlay = createInfoOverlay();
      const container = document.querySelector('#app')!;
      container.appendChild(btn);
      container.appendChild(overlay);
      btn.click();
      const closeBtn = overlay.querySelector('button')!;
      closeBtn.click();
      expect(getItemSpy).not.toHaveBeenCalled();
      expect(setItemSpy).not.toHaveBeenCalled();
    });

    it('info overlay module does not set cookies', async () => {
      const cookieSpy = vi.spyOn(document, 'cookie', 'set');
      const { createInfoButton, createInfoOverlay } = await import('../../src/ui/infoOverlay');
      createInfoButton();
      createInfoOverlay();
      expect(cookieSpy).not.toHaveBeenCalled();
    });
  });
});

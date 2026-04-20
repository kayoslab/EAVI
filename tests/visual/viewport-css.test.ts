import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf-8');

describe('US-028: CSS viewport rules', () => {
  it('T-028-09: style.css includes 100dvh for body/html height with vh fallback', () => {
    // Must have vh fallback for older browsers
    expect(css).toMatch(/height:\s*100vh/);
    // Must also have dvh override
    expect(css).toMatch(/height:\s*100dvh/);
  });

  it('T-028-09b: canvas rule includes width and height 100% to prevent shrinkage', () => {
    // Canvas must have explicit 100% sizing
    expect(css).toMatch(/canvas[^{]*\{[^}]*width:\s*100%/);
    expect(css).toMatch(/canvas[^{]*\{[^}]*height:\s*100%/);
  });
});

describe('US-028: Safe area inset on buttons', () => {
  it('T-028-10: mute button uses env(safe-area-inset-bottom) in CSS', () => {
    expect(css).toMatch(/\.eavi-mute-btn[^}]*safe-area-inset-bottom/);
  });

  it('T-028-10b: info button uses env(safe-area-inset-bottom) in CSS', () => {
    expect(css).toMatch(/\.eavi-info-btn[^}]*safe-area-inset-bottom/);
  });

  it('T-028-10c: mute button uses env(safe-area-inset-right) in CSS', () => {
    expect(css).toMatch(/\.eavi-mute-btn[^}]*safe-area-inset-right/);
  });

  it('T-028-10d: info button uses env(safe-area-inset-right) in CSS', () => {
    expect(css).toMatch(/\.eavi-info-btn[^}]*safe-area-inset-right/);
  });
});

describe('US-028: Viewport meta tag', () => {
  it('T-028-11: index.html includes viewport-fit=cover in viewport meta tag', () => {
    const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');
    expect(html).toMatch(/viewport-fit\s*=\s*cover/);
  });
});

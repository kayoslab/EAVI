import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const css = readFileSync(resolve(__dirname, '../../src/style.css'), 'utf-8');
const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf-8');

describe('US-037: Viewport safe-area and dynamic viewport handling', () => {
  it('T-037-01: html,body includes overscroll-behavior: none', () => {
    expect(css).toMatch(/html[\s\S]*?body[\s\S]*?\{[^}]*overscroll-behavior:\s*none/);
  });

  it('T-037-02: #app includes touch-action: none', () => {
    expect(css).toMatch(/#app[^}]*touch-action:\s*none/);
  });

  it('T-037-03: .eavi-info-overlay uses safe-area-inset padding on all four sides', () => {
    expect(css).toMatch(/\.eavi-info-overlay[^}]*safe-area-inset-top/);
    expect(css).toMatch(/\.eavi-info-overlay[^}]*safe-area-inset-right/);
    expect(css).toMatch(/\.eavi-info-overlay[^}]*safe-area-inset-bottom/);
    expect(css).toMatch(/\.eavi-info-overlay[^}]*safe-area-inset-left/);
  });

  it('T-037-04: index.html viewport meta includes viewport-fit=cover', () => {
    expect(html).toMatch(/viewport-fit\s*=\s*cover/);
  });

  it('T-037-05: html,body overflow is hidden', () => {
    expect(css).toMatch(/overflow:\s*hidden/);
  });

  it('T-037-06: html,body uses 100dvh with 100vh fallback', () => {
    expect(css).toMatch(/height:\s*100vh/);
    expect(css).toMatch(/height:\s*100dvh/);
  });

  it('T-037-07: .eavi-info-overlay safe-area-inset-top protects close button from notch', () => {
    expect(css).toMatch(/\.eavi-info-overlay[^}]*safe-area-inset-top/);
  });
});

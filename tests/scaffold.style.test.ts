import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-001: Global styles', () => {
  const css = readFileSync(resolve(__dirname, '..', 'src', 'style.css'), 'utf-8');

  it('resets margin to 0', () => {
    expect(css).toMatch(/margin\s*:\s*0/);
  });

  it('hides overflow', () => {
    expect(css).toMatch(/overflow\s*:\s*hidden/);
  });

  it('sets a dark background', () => {
    expect(css).toMatch(/background\s*:\s*#000|background-color\s*:\s*#000|background\s*:\s*black/);
  });
});

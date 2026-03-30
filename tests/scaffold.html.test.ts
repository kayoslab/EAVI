import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-001: index.html structure', () => {
  const html = readFileSync(resolve(__dirname, '..', 'index.html'), 'utf-8');

  it('contains a #app container', () => {
    expect(html).toContain('id="app"');
  });

  it('contains a viewport meta tag', () => {
    expect(html).toMatch(/meta.*name=["']viewport["']/);
  });

  it('loads src/main.ts as a module', () => {
    expect(html).toMatch(/script.*type=["']module["'].*src=["']\/src\/main\.ts["']/);
  });

  it('sets lang attribute to en', () => {
    expect(html).toMatch(/html.*lang=["']en["']/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-001: package.json scripts', () => {
  const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

  it('has a dev script', () => {
    expect(pkg.scripts).toHaveProperty('dev');
  });

  it('has a build script', () => {
    expect(pkg.scripts).toHaveProperty('build');
  });

  it('has a preview script', () => {
    expect(pkg.scripts).toHaveProperty('preview');
  });
});

import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

// One real build for the whole file: `npm run build` is `tsc && vite build`, which takes
// several seconds on the v2 codebase, so it runs once with a generous timeout.
let buildError: unknown = null;

describe('US-001: Production build', () => {
  beforeAll(() => {
    try {
      execSync('npm run build', { stdio: 'pipe' });
    } catch (err) {
      buildError = err;
    }
  }, 180_000);

  it('npm run build exits with code 0', () => {
    expect(buildError).toBeNull();
  });

  it('dist/index.html is generated', () => {
    expect(existsSync(resolve(__dirname, '..', 'dist', 'index.html'))).toBe(true);
  });

  it('TypeScript compiles without errors (covered by the build, which runs tsc first)', () => {
    expect(buildError).toBeNull();
  });
});

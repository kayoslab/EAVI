import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

describe('US-001: Production build', () => {
  it('npm run build exits with code 0', () => {
    expect(() => execSync('npm run build', { stdio: 'pipe' })).not.toThrow();
  });

  it('dist/index.html is generated', () => {
    execSync('npm run build', { stdio: 'pipe' });
    expect(existsSync(resolve(__dirname, '..', 'dist', 'index.html'))).toBe(true);
  });

  it('TypeScript compiles without errors', () => {
    expect(() => execSync('npx tsc --noEmit', { stdio: 'pipe' })).not.toThrow();
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('US-045: main.ts geo callback applies quality scaling via pixel ratio only', () => {
  const mainSrc = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf-8');

  it('T-045-18: main.ts geo callback calls setSize with updateStyle=false when applying quality', () => {
    // Find the setSize call in the geo callback area
    const setSizePattern = /renderer\.setSize\(window\.innerWidth,\s*window\.innerHeight,\s*false\)/;
    expect(mainSrc).toMatch(setSizePattern);
  });

  it('T-045-19: main.ts geo callback does not set inline CSS dimensions on canvas', () => {
    // After the geo callback setSize, there should be no inline style assignments
    const styleWidthPattern = /renderer\.domElement\.style\.width/;
    const styleHeightPattern = /renderer\.domElement\.style\.height/;
    expect(mainSrc).not.toMatch(styleWidthPattern);
    expect(mainSrc).not.toMatch(styleHeightPattern);
  });
});

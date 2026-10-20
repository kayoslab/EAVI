import { describe, it, expect } from 'vitest';
import { createPolytope, POLYTOPE_KINDS } from '../../../src/visual/generators/polytopes';

describe('4D polytopes', () => {
  it.each([
    ['5-cell', 5, 10],
    ['tesseract', 16, 32],
    ['16-cell', 8, 24],
    ['24-cell', 24, 96],
    ['600-cell', 120, 720],
  ] as const)('%s has %i vertices and %i edges', (kind, v, e) => {
    const p = createPolytope(kind);
    expect(p.vertices.length / 4).toBe(v);
    expect(p.edges.length).toBe(e);
  });

  it('vertices lie on the unit 3-sphere', () => {
    for (const kind of POLYTOPE_KINDS) {
      const p = createPolytope(kind);
      for (let i = 0; i < p.vertices.length; i += 4) {
        const r = Math.hypot(p.vertices[i], p.vertices[i + 1], p.vertices[i + 2], p.vertices[i + 3]);
        expect(r).toBeCloseTo(1, 5);
      }
    }
  });
});

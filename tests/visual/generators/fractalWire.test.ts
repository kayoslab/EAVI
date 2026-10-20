import { describe, it, expect } from 'vitest';
import { sierpinskiWire, mengerWire, hilbert3d } from '../../../src/visual/generators/fractalWire';

describe('fractal wire generators', () => {
  it('sierpinski: 6 edges per tetrahedron, 4^level copies per level', () => {
    const s = sierpinskiWire(3);
    expect(s.edgeCount).toBe(6 * (1 + 4 + 16 + 64));
    expect(s.maxLevel).toBe(3);
    expect(s.positions.length).toBe(s.edgeCount * 6);
    expect(Math.max(...s.levels)).toBe(3);
  });

  it('menger: 12 edges per cube, 20^level copies per level', () => {
    const m = mengerWire(2);
    expect(m.edgeCount).toBe(12 * (1 + 20 + 400));
  });

  it('hilbert3d: 8^n distinct points, consecutive points one lattice step apart along a single axis', () => {
    for (const order of [1, 2, 3]) {
      const pts = hilbert3d(order);
      const n = 1 << order;
      expect(pts.length).toBe(n * n * n * 3);
      const step = 1 / (n - 1);
      const seen = new Set<string>();
      for (let i = 0; i < pts.length; i += 3) {
        seen.add(`${Math.round((pts[i] + 0.5) / step)},${Math.round((pts[i + 1] + 0.5) / step)},${Math.round((pts[i + 2] + 0.5) / step)}`);
        expect(Math.abs(pts[i])).toBeLessThanOrEqual(0.5 + 1e-6);
        if (i > 0) {
          const dx = Math.abs(pts[i] - pts[i - 3]);
          const dy = Math.abs(pts[i + 1] - pts[i - 2]);
          const dz = Math.abs(pts[i + 2] - pts[i - 1]);
          expect(dx + dy + dz).toBeCloseTo(step, 5);
          expect(Math.max(dx, dy, dz)).toBeCloseTo(step, 5);
        }
      }
      expect(seen.size).toBe(n * n * n);
    }
  });
});

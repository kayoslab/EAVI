/**
 * Regular 4-polytopes as unit-scale vertex sets plus edge lists.
 * Edges of a regular polytope are exactly the vertex pairs at the minimum non-zero distance.
 */
export type PolytopeKind = '5-cell' | 'tesseract' | '16-cell' | '24-cell' | '600-cell';

export const POLYTOPE_KINDS: readonly PolytopeKind[] = ['5-cell', 'tesseract', '16-cell', '24-cell', '600-cell'];

export interface Polytope4D {
  readonly kind: PolytopeKind;
  /** xyzw interleaved, normalised to the unit 3-sphere. */
  readonly vertices: Float32Array;
  readonly edges: readonly [number, number][];
}

const PHI = (1 + Math.sqrt(5)) / 2;

function signs(values: number[]): number[][] {
  // All sign combinations of the non-zero components.
  const out: number[][] = [];
  const n = values.length;
  const total = 1 << n;
  for (let mask = 0; mask < total; mask++) {
    const v: number[] = [];
    let valid = true;
    for (let i = 0; i < n; i++) {
      const s = mask & (1 << i) ? -1 : 1;
      if (values[i] === 0 && s === -1) {
        valid = false;
        break;
      }
      v.push(values[i] * s);
    }
    if (valid) out.push(v);
  }
  return out;
}

function permutations(values: number[]): number[][] {
  if (values.length <= 1) return [values.slice()];
  const out: number[][] = [];
  for (let i = 0; i < values.length; i++) {
    const rest = values.slice(0, i).concat(values.slice(i + 1));
    for (const p of permutations(rest)) out.push([values[i], ...p]);
  }
  return out;
}

function isEvenPermutation(perm: number[]): boolean {
  // Parity of the permutation of indices 0..3 (values must be distinct indices).
  let inversions = 0;
  for (let i = 0; i < perm.length; i++) for (let j = i + 1; j < perm.length; j++) if (perm[i] > perm[j]) inversions++;
  return inversions % 2 === 0;
}

function dedupe(points: number[][]): number[][] {
  const seen = new Set<string>();
  const out: number[][] = [];
  for (const p of points) {
    const key = p.map((c) => Math.round(c * 1e6)).join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

function rawVertices(kind: PolytopeKind): number[][] {
  switch (kind) {
    case '5-cell': {
      const s5 = Math.sqrt(5);
      return [
        [1, 1, 1, -1 / s5], [1, -1, -1, -1 / s5], [-1, 1, -1, -1 / s5], [-1, -1, 1, -1 / s5],
        [0, 0, 0, s5 - 1 / s5],
      ];
    }
    case 'tesseract':
      return signs([1, 1, 1, 1]);
    case '16-cell':
      return dedupe(permutations([1, 0, 0, 0]).flatMap((p) => signs(p)));
    case '24-cell':
      return dedupe(permutations([1, 1, 0, 0]).flatMap((p) => signs(p)));
    case '600-cell': {
      const a = signs([0.5, 0.5, 0.5, 0.5]);
      const b = dedupe(permutations([1, 0, 0, 0]).flatMap((p) => signs(p)));
      const base = [PHI / 2, 0.5, 1 / (2 * PHI), 0];
      const c: number[][] = [];
      const idx = [0, 1, 2, 3];
      for (const perm of permutations(idx)) {
        if (!isEvenPermutation(perm)) continue;
        const v = perm.map((i) => base[i]);
        for (const s of signs(v)) c.push(s);
      }
      return dedupe([...a, ...b, ...c]);
    }
  }
}

export function createPolytope(kind: PolytopeKind): Polytope4D {
  const raw = rawVertices(kind);
  const n = raw.length;
  const vertices = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const [x, y, z, w] = raw[i];
    const len = Math.hypot(x, y, z, w) || 1;
    vertices[i * 4] = x / len;
    vertices[i * 4 + 1] = y / len;
    vertices[i * 4 + 2] = z / len;
    vertices[i * 4 + 3] = w / len;
  }
  const dist = (a: number, b: number) =>
    Math.hypot(
      vertices[a * 4] - vertices[b * 4],
      vertices[a * 4 + 1] - vertices[b * 4 + 1],
      vertices[a * 4 + 2] - vertices[b * 4 + 2],
      vertices[a * 4 + 3] - vertices[b * 4 + 3],
    );
  let minDist = Infinity;
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    const d = dist(a, b);
    if (d > 1e-6 && d < minDist) minDist = d;
  }
  const edges: [number, number][] = [];
  for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
    if (Math.abs(dist(a, b) - minDist) < 1e-4) edges.push([a, b]);
  }
  return { kind, vertices, edges };
}

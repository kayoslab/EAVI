/**
 * US-083: Parametric surface curve families for ribbon geometry.
 *
 * Three surface families seeded per visit:
 * - Helicoid: twisted ruled surface
 * - Möbius strip: single-sided surface with twist closure
 * - Torus knot: knotted toroidal surface
 *
 * Each family exposes sample(u, v, seed) → { position, normal, tangent }
 */

import { createPRNG } from '../prng';

export interface CurveSample {
  position: [number, number, number];
  normal: [number, number, number];
  tangent: [number, number, number];
}

export type CurveFamily = 'helicoid' | 'mobius' | 'torusKnot';

const TAU = Math.PI * 2;

function normalize3(v: [number, number, number]): [number, number, number] {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-10) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function cross3(
  a: [number, number, number],
  b: [number, number, number],
): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/**
 * Helicoid: a twisted ruled surface where u sweeps along the helix axis
 * and v controls the radial extent at each height.
 * u ∈ [0,1] maps to angle [0, winds·TAU] — this is the ribbon length.
 * v ∈ [0,1] maps to radial extent [-R, R].
 */
export function sampleHelicoid(u: number, v: number, seed: string): CurveSample {
  const rng = createPRNG(seed + ':helicoid');
  const R = 1.5 + rng() * 1.0;       // radius 1.5-2.5
  const c = 0.3 + rng() * 0.4;       // pitch 0.3-0.7
  const winds = 2 + Math.floor(rng() * 3); // 2-4 winds

  const angle = u * winds * TAU;      // u drives the helix angle
  const radial = (v * 2 - 1) * R;    // v drives radial extent [-R, R]

  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  const x = radial * cosA;
  const y = radial * sinA;
  const z = c * angle;                // z rises with u — gives depth along ribbon

  // dp/du (tangent along ribbon length)
  const dangle = winds * TAU;
  const dpdu: [number, number, number] = [
    -radial * sinA * dangle,
    radial * cosA * dangle,
    c * dangle,
  ];
  // dp/dv (across ribbon width)
  const dR = 2 * R;
  const dpdv: [number, number, number] = [cosA * dR, sinA * dR, 0];

  const normal = normalize3(cross3(dpdu, dpdv));
  const tangent = normalize3(dpdu);

  return {
    position: [x, y, z],
    normal,
    tangent,
  };
}

/**
 * Möbius strip: parametric form with half-twist
 * u ∈ [-w, w] (width), v ∈ [0, TAU] (around the strip)
 */
export function sampleMobius(u: number, v: number, seed: string): CurveSample {
  const rng = createPRNG(seed + ':mobius');
  const R = 2.0 + rng() * 0.8;       // major radius 2.0-2.8
  const w = 0.8 + rng() * 0.4;       // half-width 0.8-1.2

  const uParam = (u * 2 - 1) * w;    // map [0,1] → [-w, w]
  const vParam = v * TAU;             // map [0,1] → [0, TAU]

  const halfV = vParam / 2;
  const cosV = Math.cos(vParam);
  const sinV = Math.sin(vParam);
  const cosHalfV = Math.cos(halfV);
  const sinHalfV = Math.sin(halfV);

  const r = R + uParam * cosHalfV;

  const x = r * cosV;
  const y = r * sinV;
  const z = uParam * sinHalfV;

  // Partial derivatives
  const dpdu: [number, number, number] = [
    cosHalfV * cosV,
    cosHalfV * sinV,
    sinHalfV,
  ];
  const dpdv: [number, number, number] = [
    -uParam * 0.5 * sinHalfV * cosV - r * sinV,
    -uParam * 0.5 * sinHalfV * sinV + r * cosV,
    uParam * 0.5 * cosHalfV,
  ];

  const normal = normalize3(cross3(dpdu, dpdv));
  const tangent = normalize3(dpdv);

  return {
    position: [x, y, z],
    normal,
    tangent,
  };
}

// Known-good coprime pairs for torus knots
const KNOT_PAIRS: [number, number][] = [
  [2, 3], [3, 2], [2, 5], [5, 2], [3, 5], [5, 3],
  [3, 4], [4, 3], [2, 7], [7, 2], [3, 7], [7, 3],
];

/**
 * Torus knot: x = (R + r·cos(q·t))·cos(p·t), etc.
 * u parameterizes t along the knot, v parameterizes tube radius
 */
export function sampleTorusKnot(u: number, v: number, seed: string): CurveSample {
  const rng = createPRNG(seed + ':torusKnot');
  const R = 1.8 + rng() * 0.6;       // major radius 1.8-2.4
  const r = 1.2 + rng() * 0.6;       // minor radius 1.2-1.8 (ensures z-range >= 2)
  const pairIdx = Math.floor(rng() * KNOT_PAIRS.length);
  const [p, q] = KNOT_PAIRS[pairIdx];

  const t = u * TAU;                  // map [0,1] → [0, TAU]
  const phi = v * TAU;                // tube angle

  const cospt = Math.cos(p * t);
  const sinpt = Math.sin(p * t);
  const cosqt = Math.cos(q * t);
  const sinqt = Math.sin(q * t);

  // Knot centerline
  const cx = (R + r * cosqt) * cospt;
  const cy = (R + r * cosqt) * sinpt;
  const cz = r * sinqt;

  // Tangent to centerline (dt)
  const dtx = -p * (R + r * cosqt) * sinpt - r * q * sinqt * cospt;
  const dty = p * (R + r * cosqt) * cospt - r * q * sinqt * sinpt;
  const dtz = r * q * cosqt;

  const tangent = normalize3([dtx, dty, dtz]);

  // Normal: use cross with up to get binormal, then cross back
  const up: [number, number, number] = [0, 0, 1];
  let binormal = normalize3(cross3(tangent, up));
  // If tangent is parallel to up, use alternative
  const binLen = Math.sqrt(binormal[0] ** 2 + binormal[1] ** 2 + binormal[2] ** 2);
  if (binLen < 0.001) {
    binormal = normalize3(cross3(tangent, [1, 0, 0]));
  }
  const normal = normalize3(cross3(binormal, tangent));

  // Offset point on tube surface
  const tubeR = 0.08 + rng() * 0.05; // thin tube for ribbon feel
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const x = cx + (normal[0] * cosPhi + binormal[0] * sinPhi) * tubeR;
  const y = cy + (normal[1] * cosPhi + binormal[1] * sinPhi) * tubeR;
  const z = cz + (normal[2] * cosPhi + binormal[2] * sinPhi) * tubeR;

  return {
    position: [x, y, z],
    normal,
    tangent,
  };
}

/**
 * Select a curve family deterministically from seed.
 */
export function selectCurveFamily(seed: string): CurveFamily {
  const rng = createPRNG(seed + ':family');
  const val = rng();
  if (val < 0.333) return 'helicoid';
  if (val < 0.666) return 'mobius';
  return 'torusKnot';
}

/**
 * Get the sample function for a given family.
 */
export function getSampler(
  family: CurveFamily,
): (u: number, v: number, seed: string) => CurveSample {
  switch (family) {
    case 'helicoid':
      return sampleHelicoid;
    case 'mobius':
      return sampleMobius;
    case 'torusKnot':
      return sampleTorusKnot;
  }
}

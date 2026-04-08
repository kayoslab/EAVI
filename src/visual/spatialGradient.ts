// US-075: Spatial gradient palette for position-based vertex coloring

export interface GradientStop {
  r: number;
  g: number;
  b: number;
  position: number;
}

export interface SpatialGradientPalette {
  stops: GradientStop[];
}

export type PaletteMode = 'seeded' | 'vibrant';

export interface SpatialGradientOptions {
  mode?: PaletteMode;
}

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = Math.imul(s ^ (s >>> 16), 0x45d9f3b);
    s = (s ^ (s >>> 16)) >>> 0;
    return s / 0xffffffff;
  };
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = h * 6;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const m = l - c * 0.5;
  let r: number, g: number, b: number;
  if (hp < 1) { r = c; g = x; b = 0; }
  else if (hp < 2) { r = x; g = c; b = 0; }
  else if (hp < 3) { r = 0; g = c; b = x; }
  else if (hp < 4) { r = 0; g = x; b = c; }
  else if (hp < 5) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return {
    r: Math.max(0, Math.min(1, r + m)),
    g: Math.max(0, Math.min(1, g + m)),
    b: Math.max(0, Math.min(1, b + m)),
  };
}

// sRGB → linear conversion (gamma 2.2)
function srgbToLinear(c: number): number {
  return Math.pow(Math.max(0, Math.min(1, c)), 2.2);
}

// Reference vibrant stops in sRGB [0,1], converted to linear at palette creation
const VIBRANT_SRGB_STOPS = [
  { r: 0x1b / 255, g: 0x2a / 255, b: 0x8a / 255, position: 0.0 },   // #1b2a8a deep blue
  { r: 0x6a / 255, g: 0x1b / 255, b: 0xbf / 255, position: 0.33 },   // #6a1bbf purple
  { r: 0xd8 / 255, g: 0x3a / 255, b: 0x8a / 255, position: 0.67 },   // #d83a8a magenta
  { r: 0xff / 255, g: 0x7a / 255, b: 0x2a / 255, position: 1.0 },    // #ff7a2a orange
];

function createVibrantGradient(seed: string): SpatialGradientPalette {
  const hash = fnv1a(seed + ':vibrant');
  const rng = seededRandom(hash);

  const stops: GradientStop[] = VIBRANT_SRGB_STOPS.map((ref) => {
    // Convert sRGB reference to linear, then apply small seeded perturbation
    const rLin = srgbToLinear(ref.r);
    const gLin = srgbToLinear(ref.g);
    const bLin = srgbToLinear(ref.b);

    // ±10% perturbation per channel (clamped to [0,1])
    const perturb = (v: number) => {
      const delta = (rng() - 0.5) * 0.2 * Math.max(v, 0.02);
      return Math.max(0, Math.min(1, v + delta));
    };

    return {
      r: perturb(rLin),
      g: perturb(gLin),
      b: perturb(bLin),
      position: ref.position,
    };
  });

  return { stops };
}

export function createSpatialGradient(
  paletteHue: number,
  paletteSaturation: number,
  seed: string,
  options?: SpatialGradientOptions,
): SpatialGradientPalette {
  if (options?.mode === 'vibrant') {
    return createVibrantGradient(seed);
  }

  const hash = fnv1a(seed + ':spatialGradient');
  const rng = seededRandom(hash);

  // 3-5 stops based on seed
  const stopCount = 3 + Math.floor(rng() * 3); // 3, 4, or 5

  const baseHue = ((paletteHue % 360) + 360) % 360;
  const stops: GradientStop[] = [];

  for (let i = 0; i < stopCount; i++) {
    const position = i === 0 ? 0 : i === stopCount - 1 ? 1 : i / (stopCount - 1);

    // Spread hues across a range around the base hue (±80 degrees)
    const hueOffset = (rng() - 0.5) * 160;
    const hue = (((baseHue + hueOffset) % 360) + 360) % 360 / 360;

    // Bright colors: saturation 0.5-0.9, lightness 0.45-0.7
    const sat = Math.max(0.5, Math.min(0.9, paletteSaturation + (rng() - 0.5) * 0.3));
    const lightness = 0.45 + rng() * 0.25;

    const rgb = hslToRgb(hue, sat, lightness);
    stops.push({ ...rgb, position });
  }

  return { stops };
}

export function sampleGradient(palette: SpatialGradientPalette, t: number): { r: number; g: number; b: number } {
  const { stops } = palette;
  if (stops.length === 0) return { r: 0, g: 0, b: 0 };
  if (stops.length === 1) return { r: stops[0].r, g: stops[0].g, b: stops[0].b };

  // Clamp t to [0, 1]
  const tc = Math.max(0, Math.min(1, t));

  // Find the two stops to interpolate between
  if (tc <= stops[0].position) return { r: stops[0].r, g: stops[0].g, b: stops[0].b };
  if (tc >= stops[stops.length - 1].position) {
    const last = stops[stops.length - 1];
    return { r: last.r, g: last.g, b: last.b };
  }

  for (let i = 1; i < stops.length; i++) {
    if (tc <= stops[i].position) {
      const a = stops[i - 1];
      const b = stops[i];
      const range = b.position - a.position;
      const factor = range === 0 ? 0 : (tc - a.position) / range;
      // Smoothstep for smoother interpolation
      const f = factor * factor * (3 - 2 * factor);
      return {
        r: Math.max(0, Math.min(1, a.r + (b.r - a.r) * f)),
        g: Math.max(0, Math.min(1, a.g + (b.g - a.g) * f)),
        b: Math.max(0, Math.min(1, a.b + (b.b - a.b) * f)),
      };
    }
  }

  const last = stops[stops.length - 1];
  return { r: last.r, g: last.g, b: last.b };
}

export function computeVibrantVertexColors(
  positions: Float32Array,
  seed: string,
  axis?: 'x' | 'z' | 'radial',
): Float32Array {
  const palette = createSpatialGradient(0, 0, seed, { mode: 'vibrant' });
  return computeVertexColors(positions, palette, { axis: axis ?? 'x' });
}

export function computeVertexColors(
  positions: Float32Array,
  palette: SpatialGradientPalette,
  opts?: { axis?: 'x' | 'z' | 'radial'; itemStride?: number },
): Float32Array {
  const vertexCount = positions.length / 3;
  if (vertexCount === 0) return new Float32Array(0);

  const axis = opts?.axis ?? 'x';

  // Extract the relevant coordinate for each vertex
  function getValue(idx: number): number {
    const base = idx * 3;
    if (axis === 'x') return positions[base];
    if (axis === 'z') return positions[base + 2];
    // radial: distance in xz-plane
    const x = positions[base];
    const z = positions[base + 2];
    return Math.sqrt(x * x + z * z);
  }

  // Find min/max across all vertices
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < vertexCount; i++) {
    const v = getValue(i);
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const range = max - min;
  const colors = new Float32Array(vertexCount * 3);

  for (let i = 0; i < vertexCount; i++) {
    const v = getValue(i);
    const t = range === 0 ? 0.5 : (v - min) / range;
    const c = sampleGradient(palette, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }

  return colors;
}

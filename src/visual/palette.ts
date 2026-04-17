/**
 * Palette family system for geo-to-colour mapping.
 *
 * Maps coarse geographic classes (continental/climatic regions) to
 * perceptible colour families. The mapping is intentionally coarse —
 * partially legible but not a geography quiz.
 */

/** A palette family defines a constrained colour region on the hue wheel. */
export interface PaletteFamily {
  id: string;
  /** Centre of the hue range, 0-360 */
  hueCenter: number;
  /** Spread around centre (hue lives in hueCenter ± hueRange/2) */
  hueRange: number;
  /** Base saturation for this family, 0.3-0.8 */
  saturationBase: number;
  warmth: 'warm' | 'cool' | 'neutral';
}

/** All recognised coarse geo classes. */
export type GeoClass =
  | 'tropical'
  | 'northern'
  | 'southern'
  | 'oceanic'
  | 'continental'
  | 'temperate'
  | 'unknown';

// ---------------------------------------------------------------------------
// Palette family definitions
// ---------------------------------------------------------------------------

const paletteFamilies: Record<GeoClass, PaletteFamily> = {
  tropical:     { id: 'tropical',     hueCenter: 30,  hueRange: 90,  saturationBase: 0.70, warmth: 'warm' },
  northern:     { id: 'northern',     hueCenter: 180, hueRange: 100, saturationBase: 0.45, warmth: 'cool' },
  southern:     { id: 'southern',     hueCenter: 280, hueRange: 100, saturationBase: 0.55, warmth: 'cool' },
  oceanic:      { id: 'oceanic',      hueCenter: 210, hueRange: 80,  saturationBase: 0.50, warmth: 'cool' },
  continental:  { id: 'continental',  hueCenter: 45,  hueRange: 90,  saturationBase: 0.55, warmth: 'warm' },
  temperate:    { id: 'temperate',    hueCenter: 120, hueRange: 100, saturationBase: 0.50, warmth: 'neutral' },
  unknown:      { id: 'unknown',      hueCenter: 180, hueRange: 360, saturationBase: 0.55, warmth: 'neutral' },
};

// ---------------------------------------------------------------------------
// Coarse geo classification table
// ---------------------------------------------------------------------------

const geoClassTable: Record<string, GeoClass> = {};

function assignClass(codes: string[], cls: GeoClass) {
  for (const c of codes) geoClassTable[c] = cls;
}

// Tropical belt
assignClass(
  ['BR', 'CO', 'VE', 'PE', 'EC', 'NG', 'GH', 'KE', 'TZ', 'TH', 'VN', 'ID', 'PH', 'MY', 'SG', 'IN', 'MX', 'CU', 'CR', 'PA'],
  'tropical',
);

// Northern / boreal
assignClass(
  ['NO', 'SE', 'FI', 'IS', 'DK', 'EE', 'LV', 'LT', 'RU', 'CA'],
  'northern',
);

// Southern hemisphere
assignClass(
  ['AR', 'CL', 'UY', 'ZA', 'NZ'],
  'southern',
);

// Oceanic / island nations
assignClass(
  ['AU', 'JP', 'TW', 'GB', 'IE', 'PT'],
  'oceanic',
);

// Continental / inland
assignClass(
  ['US', 'CN', 'DE', 'PL', 'CZ', 'AT', 'CH', 'HU', 'RO', 'UA', 'TR'],
  'continental',
);

// Temperate
assignClass(
  ['FR', 'IT', 'ES', 'GR', 'HR', 'KR', 'IL', 'BE', 'NL'],
  'temperate',
);

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Classify a coarse geo hint into a broad climatic/continental class.
 * Returns 'unknown' for null or unrecognized country codes.
 */
export function classifyGeo(
  country: string | null,
  _region: string | null,
): GeoClass {
  if (country === null) return 'unknown';
  return geoClassTable[country] ?? 'unknown';
}

/**
 * Look up the palette family for a given geo class.
 */
export function getPaletteFamily(cls: GeoClass): PaletteFamily {
  return paletteFamilies[cls];
}

/**
 * Get all defined palette families (for testing/validation).
 */
export function getAllPaletteFamilies(): Record<GeoClass, PaletteFamily> {
  return paletteFamilies;
}

/**
 * Get all valid geo classes (for testing/validation).
 */
export function getAllGeoClasses(): GeoClass[] {
  return Object.keys(paletteFamilies) as GeoClass[];
}

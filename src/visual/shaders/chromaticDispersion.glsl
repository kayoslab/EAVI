// Chromatic dispersion (RGB channel separation) functions
// US-059: Prismatic effect driven by audio energy

// Point-based chromatic dispersion using gl_PointCoord offsets.
// Shifts R and B channels in opposite directions for RGB fringing at point edges.
// When dispersion = 0.0, output equals input color (no visual change).
vec3 chromaticPoint(vec3 baseColor, vec2 pointCoord, float dispersion) {
  float offset = dispersion * 0.08;
  vec2 center = pointCoord - vec2(0.5);

  // R channel samples at offset position
  vec2 rCoord = center + vec2(offset, 0.0);
  float rDist = length(rCoord);
  float rAlpha = 1.0 - smoothstep(0.3, 0.5, rDist);

  // G channel samples at center (no offset)
  float gDist = length(center);
  float gAlpha = 1.0 - smoothstep(0.3, 0.5, gDist);

  // B channel samples at opposite offset
  vec2 bCoord = center - vec2(offset, 0.0);
  float bDist = length(bCoord);
  float bAlpha = 1.0 - smoothstep(0.3, 0.5, bDist);

  // Normalize each channel by its own alpha relative to center alpha
  float safeG = max(gAlpha, 0.001);
  return vec3(
    baseColor.r * rAlpha / safeG,
    baseColor.g,
    baseColor.b * bAlpha / safeG
  );
}

// Line-based chromatic dispersion using multiplicative RGB channel shift.
// Warm shift on R, cool shift on B, slight G reduction.
// When dispersion = 0.0, multipliers are 1.0 (identity — no change).
vec3 chromaticLine(vec3 baseColor, float dispersion) {
  return vec3(
    baseColor.r * (1.0 + dispersion * 0.3),
    baseColor.g * (1.0 - dispersion * 0.1),
    baseColor.b * (1.0 + dispersion * 0.25)
  );
}

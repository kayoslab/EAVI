// Wireframe polyhedra fragment shader
// US-054: Depth fog, palette-based coloring, audio-reactive alpha
// US-081: Tri-stop vibrant gradient replaces HSL coloring

uniform float uOpacity;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDispersion;

varying float vFogFactor;
varying vec3 vWorldPos;

// Tri-stop vibrant gradient: deep blue → purple → magenta → orange (linear space)
vec3 triStopGradient(float t) {
  vec3 stop0 = vec3(0.014, 0.032, 0.222);  // deep blue
  vec3 stop1 = vec3(0.125, 0.014, 0.445);  // purple
  vec3 stop2 = vec3(0.582, 0.052, 0.222);  // magenta
  vec3 stop3 = vec3(1.000, 0.186, 0.028);  // orange
  float tc = clamp(t, 0.0, 1.0);
  if (tc < 0.33) {
    float f = tc / 0.33;
    f = f * f * (3.0 - 2.0 * f);
    return mix(stop0, stop1, f);
  } else if (tc < 0.67) {
    float f = (tc - 0.33) / 0.34;
    f = f * f * (3.0 - 2.0 * f);
    return mix(stop1, stop2, f);
  } else {
    float f = (tc - 0.67) / 0.33;
    f = f * f * (3.0 - 2.0 * f);
    return mix(stop2, stop3, f);
  }
}

void main() {
  // Spatial gradient based on normalized world position
  float spatialT = clamp((vWorldPos.x + 3.0) / 6.0, 0.0, 1.0);

  // Base lightness with treble shimmer
  float brightness = 1.0 + uTrebleEnergy * 0.15;

  vec3 color = triStopGradient(spatialT) * brightness;

  // Chromatic dispersion: multiplicative RGB channel shift
  color = chromaticLine(color, uDispersion);

  // Bass modulates overall line visibility (wireframe is more visible than constellation)
  float bassAlpha = 0.5 + uBassEnergy * 0.5;

  // Depth-based color desaturation
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.7, lum * 0.75, lum * 0.85);
  color = mix(color, fogTint, vFogFactor * 0.25);

  // Soft luminance cap to prevent bloom clipping
  lum = dot(color, vec3(0.299, 0.587, 0.114));
  color *= min(1.0, 0.95 / max(lum, 0.001));

  // Combine all alpha factors
  float alpha = bassAlpha * (1.0 - vFogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

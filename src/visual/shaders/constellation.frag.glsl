// Constellation connection lines fragment shader
// US-055: Distance-based opacity fade, treble brightness, depth fog

uniform float uOpacity;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uProximityThreshold;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDispersion;

varying float vAlpha;
varying float vDepth;

// HSL to RGB conversion
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h * 6.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

void main() {
  float hue = mod(uPaletteHue, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;

  // Base lightness with treble shimmer
  float lightness = 0.55 + uTrebleEnergy * 0.15;

  vec3 color = hsl2rgb(hue, uPaletteSaturation * 0.7, lightness);

  // Chromatic dispersion: multiplicative RGB channel shift
  color = chromaticLine(color, uDispersion);

  // Bass modulates overall line visibility (high bass = more visible web)
  float bassAlpha = 0.3 + uBassEnergy * 0.7;

  // Atmospheric depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);

  // Depth-based color desaturation
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.7, lum * 0.75, lum * 0.85);
  color = mix(color, fogTint, fogFactor * 0.25);

  // Combine all alpha factors
  float alpha = vAlpha * bassAlpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

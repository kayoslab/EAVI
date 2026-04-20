// Terrain heightfield edge fragment shader
// US-074: Depth fog, palette-based coloring for terrain grid lines

uniform float uOpacity;
uniform float uBassEnergy;
uniform float uBeatPulse;
uniform float uTrebleEnergy;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uFogNear;
uniform float uFogFar;

uniform float uHasVertexColor;

varying float vFogFactor;
varying vec3 vVertexColor;

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

  float lightness = 0.5 + uTrebleEnergy * 0.15;
  vec3 hslColor = hsl2rgb(hue, uPaletteSaturation * 0.6, lightness);
  vec3 color = mix(hslColor, vVertexColor, uHasVertexColor);

  color = chromaticLine(color, 0.0);

  // Audio warmth: bass gently warms color, combined energy enriches saturation
  color += vec3(uBassEnergy * 0.04, uBassEnergy * 0.015, 0.0);
  color *= 1.0 + (uBassEnergy + uTrebleEnergy) * 0.04;

  // Beat pulse: brief brightness flash
  color *= 1.0 + uBeatPulse * 0.08;

  float bassAlpha = 0.4 + uBassEnergy * 0.6;

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.7, lum * 0.75, lum * 0.85);
  color = mix(color, fogTint, vFogFactor * 0.3);

  float alpha = bassAlpha * (1.0 - vFogFactor * 0.9) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

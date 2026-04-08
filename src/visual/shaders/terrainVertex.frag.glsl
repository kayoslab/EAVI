// Terrain heightfield vertex (Points) fragment shader
// US-074: Soft circular terrain vertex dots with fog

uniform float uOpacity;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uFogNear;
uniform float uFogFar;

varying float vFogFactor;

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
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  float pointAlpha = 1.0 - smoothstep(0.3, 0.5, dist);

  float hue = mod(uPaletteHue, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;

  float lightness = 0.55 + uTrebleEnergy * 0.2;
  vec3 color = hsl2rgb(hue, uPaletteSaturation * 0.65, lightness);

  color = chromaticPoint(color, gl_PointCoord, 0.0);

  float bassAlpha = 0.4 + uBassEnergy * 0.6;

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.5, lum * 0.55, lum * 0.7);
  color = mix(color, fogTint, vFogFactor * 0.6);

  float alpha = pointAlpha * bassAlpha * (1.0 - vFogFactor * 0.9) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

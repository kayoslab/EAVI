// Terrain dense particle wave sheet fragment shader
// US-076: Soft glowing round sprite with additive blending

uniform float uOpacity;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uFogNear;
uniform float uFogFar;

uniform float uHasVertexColor;

varying float vFogFactor;
varying vec3 vVertexColor;
varying float vCoC;

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

  // Smoother center glow — CoC-dependent for bokeh softness
  float innerEdge = mix(0.0, 0.0, vCoC);
  float pointAlpha = 1.0 - smoothstep(innerEdge, 0.5, dist);
  pointAlpha *= mix(1.0, 0.35, vCoC);

  float hue = mod(uPaletteHue, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;

  float lightness = 0.6 + uTrebleEnergy * 0.2;
  vec3 hslColor = hsl2rgb(hue, uPaletteSaturation * 0.65, lightness);
  vec3 color = mix(hslColor, vVertexColor, uHasVertexColor);

  color = chromaticPoint(color, gl_PointCoord, 0.0);

  float bassAlpha = 0.4 + uBassEnergy * 0.6;

  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.5, lum * 0.55, lum * 0.7);
  color = mix(color, fogTint, vFogFactor * 0.6);

  float alpha = pointAlpha * bassAlpha * (1.0 - vFogFactor * 0.9) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

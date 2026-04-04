// Crystal mode fragment shader — sharp faceted point appearance
// US-044: Step-edge blend for crystalline character

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying float vDepth;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  // Sharper falloff than pointWarp — step edge for faceted appearance
  float alpha = 1.0 - smoothstep(0.35, 0.45, dist);

  // Atmospheric depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);

  // Depth-based color desaturation (cool shift)
  vec3 color = vColor;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.6, lum * 0.65, lum * 0.8);
  color = mix(color, fogTint, fogFactor * 0.5);

  // Fog alpha attenuation (capped at 85% to keep far points ghostly)
  float fogAlpha = alpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, fogAlpha);
}

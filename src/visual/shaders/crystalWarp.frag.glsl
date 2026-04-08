// Crystal mode fragment shader — sharp faceted point appearance
// US-044: Step-edge blend for crystalline character

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDispersion;

varying vec3 vColor;
varying float vDepth;
varying float vCoC;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  // Sharper falloff — CoC-dependent bokeh softness
  float innerEdge = mix(0.35, 0.05, vCoC);
  float outerEdge = mix(0.45, 0.5, vCoC);
  float alpha = 1.0 - smoothstep(innerEdge, outerEdge, dist);
  alpha *= mix(1.0, 0.35, vCoC);

  // Chromatic dispersion: per-channel gl_PointCoord offset
  vec3 color = chromaticPoint(vColor, gl_PointCoord, uDispersion);

  // Atmospheric depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);

  // Depth-based color desaturation (cool shift)
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.6, lum * 0.65, lum * 0.8);
  color = mix(color, fogTint, fogFactor * 0.5);

  // Fog alpha attenuation (capped at 85% to keep far points ghostly)
  float fogAlpha = alpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, fogAlpha);
}

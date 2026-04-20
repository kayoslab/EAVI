// Crystal mode fragment shader — sharp faceted point appearance
// US-044: Step-edge blend for crystalline character

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDispersion;
uniform float uHasVertexColor;
uniform float uBassEnergy;
uniform float uTrebleEnergy;

varying vec3 vColor;
varying vec3 vVertexColor;
varying float vDepth;
varying float vCoC;
varying vec3 vFacetNormal;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  // Sharper falloff — CoC-dependent bokeh softness
  float innerEdge = mix(0.35, 0.05, vCoC);
  float outerEdge = mix(0.45, 0.5, vCoC);
  float alpha = 1.0 - smoothstep(innerEdge, outerEdge, dist);
  alpha *= mix(1.0, 0.35, vCoC);

  // Vibrant vertex color with fallback
  vec3 baseColor = mix(vColor, vVertexColor, uHasVertexColor);

  // Facet-facing brightness: facets facing camera appear brighter (pseudo-Lambertian)
  float facing = abs(dot(normalize(vFacetNormal), vec3(0.0, 0.0, 1.0)));
  baseColor *= 0.7 + 0.3 * facing;

  // Chromatic dispersion: per-channel gl_PointCoord offset
  vec3 color = chromaticPoint(baseColor, gl_PointCoord, uDispersion);

  // Audio warmth: bass gently warms color, combined energy enriches saturation
  color += vec3(uBassEnergy * 0.04, uBassEnergy * 0.015, 0.0);
  color *= 1.0 + (uBassEnergy + uTrebleEnergy) * 0.04;

  // Atmospheric depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);

  // Depth-based color desaturation (cool shift)
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.7, lum * 0.75, lum * 0.85);
  color = mix(color, fogTint, fogFactor * 0.25);

  // Soft luminance cap to prevent bloom clipping
  lum = dot(color, vec3(0.299, 0.587, 0.114));
  color *= min(1.0, 0.95 / max(lum, 0.001));

  // Fog alpha attenuation (capped at 85% to keep far points ghostly)
  float fogAlpha = alpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, fogAlpha);
}

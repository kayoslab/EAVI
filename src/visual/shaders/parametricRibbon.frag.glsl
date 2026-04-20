// US-083: Parametric surface ribbon fragment shader
// Adds vCurveParam for length-based brightness and edge glow

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
varying float vCurveParam;

void main() {
  // Circular point shape from gl_PointCoord
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Discard outside radius
  if (dist > 0.5) discard;

  // Soft edge falloff — CoC-dependent for bokeh softness
  float innerEdge = mix(0.3, 0.05, vCoC);
  float alpha = 1.0 - smoothstep(innerEdge, 0.5, dist);
  alpha *= mix(1.0, 0.35, vCoC);

  // Vibrant vertex color with fallback
  vec3 baseColor = mix(vColor, vVertexColor, uHasVertexColor);

  // Chromatic dispersion: per-channel gl_PointCoord offset
  vec3 color = chromaticPoint(baseColor, gl_PointCoord, uDispersion);

  // Subtle length-based edge glow: points near ribbon ends get slight bloom
  float endProximity = 1.0 - 4.0 * (vCurveParam - 0.5) * (vCurveParam - 0.5);
  color += color * endProximity * 0.08;

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

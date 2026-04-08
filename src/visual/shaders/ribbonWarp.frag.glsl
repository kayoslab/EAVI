// Audio-driven 3D ribbon fragment shader
// US-034: Soft circular points with per-vertex color (same as pointWarp)

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;
uniform float uDispersion;

varying vec3 vColor;
varying float vDepth;
varying float vCoC;

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

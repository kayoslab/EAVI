// Particle field fragment shader
// US-041: Soft circular points with per-vertex color

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying float vDepth;

void main() {
  // Circular point shape from gl_PointCoord
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Discard outside radius
  if (dist > 0.5) discard;

  // Soft edge falloff for antialiased points
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

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

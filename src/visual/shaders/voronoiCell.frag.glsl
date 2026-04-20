// Voronoi cellular fragment shader for point cloud
// US-058: Faceted stained-glass / cracked-ice look with audio-reactive boundaries

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;
uniform float uBassEnergy;
uniform float uBeatPulse;
uniform float uTrebleEnergy;
uniform float uVoronoiGridSize;
uniform float uTime;
uniform float uDispersion;

varying vec3 vColor;
varying float vDepth;

// Simple pseudo-random hash for cell point placement
vec2 voronoiHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

void main() {
  // Circular point boundary — discard outside radius
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);
  if (dist > 0.5) discard;

  // Scale gl_PointCoord into voronoi grid space
  // Bass stretches cells larger (fewer, bigger cells)
  float gridSize = uVoronoiGridSize * (1.0 - uBassEnergy * 0.3);
  vec2 uv = gl_PointCoord * gridSize;

  vec2 iuv = floor(uv);
  vec2 fuv = fract(uv);

  // Find F1 (nearest) and F2 (second nearest) distances
  float F1 = 1e9;
  float F2 = 1e9;

  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbor = vec2(float(i), float(j));
      vec2 point = voronoiHash(iuv + neighbor);

      // Animate cell points subtly over time
      point = 0.5 + 0.5 * sin(uTime * 0.001 + 6.2831 * point);

      vec2 diff = neighbor + point - fuv;
      float d = length(diff);

      if (d < F1) {
        F2 = F1;
        F1 = d;
      } else if (d < F2) {
        F2 = d;
      }
    }
  }

  // Edge detection: treble sharpens/cracks edges
  float edgeWidth = mix(0.08, 0.02, uTrebleEnergy);
  float blur = 0.03;
  float edgeFactor = smoothstep(edgeWidth, edgeWidth + blur, F2 - F1);

  // Cell interior: palette-derived vColor
  // Edge color: darkened vColor with slight cool shift (no hsl round-trip)
  vec3 edgeColor = vec3(vColor.r * 0.25, vColor.g * 0.3, vColor.b * 0.45);
  vec3 cellColor = mix(edgeColor, vColor, edgeFactor);

  // Chromatic dispersion applied to final cellColor (post-Voronoi)
  cellColor = chromaticPoint(cellColor, gl_PointCoord, uDispersion);

  // Beat pulse: brief brightness flash
  cellColor *= 1.0 + uBeatPulse * 0.08;

  // Soft circular edge falloff
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

  // Atmospheric depth fog (identical to pointWarp.frag.glsl)
  float fogFactor = smoothstep(uFogNear, uFogFar, vDepth);

  // Depth-based color desaturation (cool shift)
  float lum = dot(cellColor, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.7, lum * 0.75, lum * 0.85);
  cellColor = mix(cellColor, fogTint, fogFactor * 0.25);

  // Fog alpha attenuation (capped at 85% to keep far points ghostly)
  float fogAlpha = alpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(cellColor, fogAlpha);
}

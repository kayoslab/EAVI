// Crystal mode fragment shader — sharp faceted point appearance
// US-044: Step-edge blend for crystalline character

uniform float uOpacity;

varying vec3 vColor;

void main() {
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  if (dist > 0.5) discard;

  // Sharper falloff than pointWarp — step edge for faceted appearance
  float alpha = 1.0 - smoothstep(0.35, 0.45, dist);

  gl_FragColor = vec4(vColor, alpha * 0.85 * uOpacity);
}

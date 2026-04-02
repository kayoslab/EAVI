// Audio-driven 3D warp fragment shader for point cloud
// US-032: Soft circular points with per-vertex color

uniform float uOpacity;

varying vec3 vColor;

void main() {
  // Circular point shape from gl_PointCoord
  vec2 center = gl_PointCoord - vec2(0.5);
  float dist = length(center);

  // Discard outside radius
  if (dist > 0.5) discard;

  // Soft edge falloff for antialiased points
  float alpha = 1.0 - smoothstep(0.3, 0.5, dist);

  gl_FragColor = vec4(vColor, alpha * 0.85 * uOpacity);
}

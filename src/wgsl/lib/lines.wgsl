// Screen-space line expansion. Pure module: functions only, no bindings.
// A segment becomes a 6-vertex quad; call once per vertex with corner 0..5.

// Returns the clip-space position of quad corner `corner` for the segment a→b,
// `thicknessPx` wide in device pixels. Segments behind the camera collapse off-screen.
export fn lineQuadVertex(ca: vec4f, cb: vec4f, corner: u32, thicknessPx: f32, resolution: vec2f) -> vec4f {
  if (ca.w <= 0.0001 || cb.w <= 0.0001) {
    return vec4f(2.0, 2.0, 0.0, 1.0);
  }
  let pa = ca.xy / ca.w;
  let pb = cb.xy / cb.w;
  let dirPx = (pb - pa) * resolution;
  let len = length(dirPx);
  var normal = vec2f(0.0, 1.0);
  if (len > 0.0001) {
    let d = dirPx / len;
    normal = vec2f(-d.y, d.x);
  }
  // corners: 0 a-, 1 b-, 2 a+, 3 a+, 4 b-, 5 b+
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let positive = corner == 2u || corner == 3u || corner == 5u;
  let side = select(-1.0, 1.0, positive);
  let offsetNdc = normal * (thicknessPx * 0.5) / resolution * 2.0 * side;
  let c = select(ca, cb, atB);
  let p = select(pa, pb, atB) + offsetNdc;
  return vec4f(p * c.w, c.z, c.w);
}

// Across-line coordinate in -1..1 for soft edges: derive from the corner id.
export fn lineQuadAcross(corner: u32) -> f32 {
  let positive = corner == 2u || corner == 3u || corner == 5u;
  return select(-1.0, 1.0, positive);
}

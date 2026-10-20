// Shared terrain heightfield: a procedural grid of rolling hills, evaluated in the
// vertex stage (no buffers). Pure module: functions only, no bindings.

import { fbmSimplex2d } from "@vgpu/wgsl-std/noise/simplex";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

// Grid index → world coordinate. Spacing grows with distance so a fixed vertex budget
// reaches `extent` units out; perspective keeps the far cells visually even.
export fn terrainCoord(index: u32, count: u32, extent: f32) -> f32 {
  let u = f32(index) / f32(max(count, 2u) - 1u) * 2.0 - 1.0;
  return sign(u) * pow(abs(u), 2.4) * extent;
}

// Alpha falloff toward the grid edge so the landscape always dissolves into space before it ends.
export fn terrainEdgeFade(x: f32, z: f32, extent: f32) -> f32 {
  let r = length(vec2f(x, z)) / max(extent, 1.0);
  return 1.0 - smoothstep(0.12, 0.62, r);
}

export fn terrainHeight(x: f32, z: f32, scroll: f32, noiseScale: f32, heightScale: f32, bass: f32) -> f32 {
  let p = vec2f(x, z + scroll) * noiseScale;
  let broad = fbmSimplex2d(p, 4, 2.0, 0.5);
  // Ridged detail gives the peaks a crisp crest.
  let ridge = 1.0 - abs(fbmSimplex2d(p * 2.3 + vec2f(13.1, 7.7), 2, 2.0, 0.5));
  let far = 1.0 + min(length(vec2f(x, z)) * 0.004, 0.4);
  return (broad * 0.8 + ridge * 0.25 - 0.2) * heightScale * far * (1.0 + bass * 0.12);
}

// Warm landscape ramp: indigo valleys → violet → magenta → amber peaks, nudged toward the session hue.
export fn terrainColor(t: f32, hue: f32, hueMix: f32) -> vec3f {
  let indigo = vec3f(0.07, 0.09, 0.48);
  let violet = vec3f(0.42, 0.14, 0.66);
  let magenta = vec3f(0.88, 0.24, 0.52);
  let amber = vec3f(1.0, 0.58, 0.18);
  let spread = clamp((t - 0.28) / 0.5, 0.0, 1.0);
  let x = spread * 3.0;
  var c: vec3f;
  if (x < 1.0) { c = mix(indigo, violet, x); }
  else if (x < 2.0) { c = mix(violet, magenta, x - 1.0); }
  else { c = mix(magenta, amber, x - 2.0); }
  let session = hueToRgb(hue + spread * 60.0, 0.75, 1.0);
  return mix(c, c * 0.5 + session * 0.6, hueMix);
}

// Hyperspace starfield in the camera's local frame: stars fall toward the eye
// along the view axis and wrap, so the field is endless whatever the camera does.

import { pcg3d, unitFloat } from "@vgpu/wgsl-std/hash";

struct Params {
  dt: f32,
  speed: f32,
  radius: f32,
  length: f32,
  count: u32,
  seed: u32,
  pad0: u32,
  pad1: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> stars: array<vec4f>;   // x, y, z (distance ahead), brightness

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  var s = stars[i];
  s.z -= params.speed * params.dt;
  if (s.z < 0.2) {
    let h = pcg3d(vec3u(i, params.seed, bitcast<u32>(s.z) ^ 0x51ed27u));
    let a = unitFloat(h.x) * 6.28318530718;
    let r = sqrt(unitFloat(h.y)) * params.radius;
    s = vec4f(cos(a) * r, sin(a) * r, params.length - unitFloat(h.z) * 2.0, 0.4 + unitFloat(h.x ^ h.z) * 0.6);
  }
  stars[i] = s;
}

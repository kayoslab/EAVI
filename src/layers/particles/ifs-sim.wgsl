// 3D iterated-function-system clouds: every particle keeps applying one of up to
// eight contractive affine maps picked by weight, so the cloud settles onto the
// system's attractor. Two parameter sets are blended by `morph`, which makes the
// cloud dissolve from one fractal into the next with no jump.

import { hashU32, unitFloat } from "@vgpu/wgsl-std/hash";

struct Params {
  // Set A and set B: 8 maps × (row0, row1, row2, meta) where rows hold the 3×3 matrix
  // with the translation in .w and meta = (weight, colour, 0, 0).
  a0: vec4f, a1: vec4f, a2: vec4f, a3: vec4f, a4: vec4f, a5: vec4f, a6: vec4f, a7: vec4f,
  a8: vec4f, a9: vec4f, a10: vec4f, a11: vec4f, a12: vec4f, a13: vec4f, a14: vec4f, a15: vec4f,
  a16: vec4f, a17: vec4f, a18: vec4f, a19: vec4f, a20: vec4f, a21: vec4f, a22: vec4f, a23: vec4f,
  a24: vec4f, a25: vec4f, a26: vec4f, a27: vec4f, a28: vec4f, a29: vec4f, a30: vec4f, a31: vec4f,
  b0: vec4f, b1: vec4f, b2: vec4f, b3: vec4f, b4: vec4f, b5: vec4f, b6: vec4f, b7: vec4f,
  b8: vec4f, b9: vec4f, b10: vec4f, b11: vec4f, b12: vec4f, b13: vec4f, b14: vec4f, b15: vec4f,
  b16: vec4f, b17: vec4f, b18: vec4f, b19: vec4f, b20: vec4f, b21: vec4f, b22: vec4f, b23: vec4f,
  b24: vec4f, b25: vec4f, b26: vec4f, b27: vec4f, b28: vec4f, b29: vec4f, b30: vec4f, b31: vec4f,
  morph: f32,
  time: f32,
  bass: f32,
  jitter: f32,
  count: u32,
  steps: u32,
  seed: u32,
  pad0: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;   // xyz, life/colour mix

fn rowA(i: u32) -> vec4f {
  switch (i) {
    case 0u: { return params.a0; } case 1u: { return params.a1; } case 2u: { return params.a2; } case 3u: { return params.a3; }
    case 4u: { return params.a4; } case 5u: { return params.a5; } case 6u: { return params.a6; } case 7u: { return params.a7; }
    case 8u: { return params.a8; } case 9u: { return params.a9; } case 10u: { return params.a10; } case 11u: { return params.a11; }
    case 12u: { return params.a12; } case 13u: { return params.a13; } case 14u: { return params.a14; } case 15u: { return params.a15; }
    case 16u: { return params.a16; } case 17u: { return params.a17; } case 18u: { return params.a18; } case 19u: { return params.a19; }
    case 20u: { return params.a20; } case 21u: { return params.a21; } case 22u: { return params.a22; } case 23u: { return params.a23; }
    case 24u: { return params.a24; } case 25u: { return params.a25; } case 26u: { return params.a26; } case 27u: { return params.a27; }
    case 28u: { return params.a28; } case 29u: { return params.a29; } case 30u: { return params.a30; } default: { return params.a31; }
  }
}

fn rowB(i: u32) -> vec4f {
  switch (i) {
    case 0u: { return params.b0; } case 1u: { return params.b1; } case 2u: { return params.b2; } case 3u: { return params.b3; }
    case 4u: { return params.b4; } case 5u: { return params.b5; } case 6u: { return params.b6; } case 7u: { return params.b7; }
    case 8u: { return params.b8; } case 9u: { return params.b9; } case 10u: { return params.b10; } case 11u: { return params.b11; }
    case 12u: { return params.b12; } case 13u: { return params.b13; } case 14u: { return params.b14; } case 15u: { return params.b15; }
    case 16u: { return params.b16; } case 17u: { return params.b17; } case 18u: { return params.b18; } case 19u: { return params.b19; }
    case 20u: { return params.b20; } case 21u: { return params.b21; } case 22u: { return params.b22; } case 23u: { return params.b23; }
    case 24u: { return params.b24; } case 25u: { return params.b25; } case 26u: { return params.b26; } case 27u: { return params.b27; }
    case 28u: { return params.b28; } case 29u: { return params.b29; } case 30u: { return params.b30; } default: { return params.b31; }
  }
}

fn row(i: u32) -> vec4f {
  return mix(rowA(i), rowB(i), params.morph);
}

fn weight(m: u32) -> f32 {
  return row(m * 4u + 3u).x;
}

fn apply(m: u32, p: vec3f) -> vec3f {
  let r0 = row(m * 4u);
  let r1 = row(m * 4u + 1u);
  let r2 = row(m * 4u + 2u);
  return vec3f(
    dot(r0.xyz, p) + r0.w,
    dot(r1.xyz, p) + r1.w,
    dot(r2.xyz, p) + r2.w,
  );
}

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  var st = particles[i];
  var p = st.xyz;
  var colour = st.w;
  var rng = hashU32(i ^ params.seed ^ (u32(params.time * 60.0) * 2654435761u));
  var total = 0.0;
  for (var m = 0u; m < 8u; m++) { total += weight(m); }

  for (var k = 0u; k < params.steps; k++) {
    rng = hashU32(rng + 0x9e3779b9u);
    let u = unitFloat(rng) * max(total, 1e-6);
    var acc = 0.0;
    var pick = 7u;
    for (var m = 0u; m < 8u; m++) {
      acc += weight(m);
      if (u < acc) { pick = m; break; }
    }
    p = apply(pick, p);
    colour = mix(colour, row(pick * 4u + 3u).y, 0.5);
  }
  // Bass adds a faint breathing jitter so the cloud never freezes.
  rng = hashU32(rng);
  let j = (vec3f(unitFloat(rng), unitFloat(hashU32(rng)), unitFloat(hashU32(rng + 7u))) - 0.5) * params.jitter * (0.2 + params.bass);
  p += j;
  if (!(abs(p.x) < 50.0 && abs(p.y) < 50.0 && abs(p.z) < 50.0)) {
    p = vec3f(unitFloat(rng), unitFloat(hashU32(rng)), unitFloat(hashU32(rng + 3u))) - 0.5;
  }
  particles[i] = vec4f(p, colour);
}

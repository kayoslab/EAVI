// Julia set zoom into a storage texture: a slowly drifting constant and a breathing
// zoom give an endless, smooth animation. Smooth iteration count → warm ramp.

import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Params {
  c: vec2f,
  center: vec2f,
  zoom: f32,
  hue: f32,
  iterations: u32,
  width: u32,
  height: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var outTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) / vec2f(f32(params.width), f32(params.height));
  let aspect = f32(params.width) / f32(params.height);
  var z = (uv - 0.5) * vec2f(aspect, 1.0) * (3.0 / params.zoom) + params.center;
  var i = 0u;
  var m2 = 0.0;
  for (; i < params.iterations; i++) {
    z = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + params.c;
    m2 = dot(z, z);
    if (m2 > 64.0) { break; }
  }
  var color = vec3f(0.0);
  var alpha = 0.0;
  if (i < params.iterations) {
    let smoothIter = f32(i) - log2(max(log2(max(m2, 1.0001)), 1.0001)) + 4.0;
    let t = fract(smoothIter * 0.05);
    color = hueToRgb(params.hue + t * 200.0, 0.8, 1.0) * (0.3 + 0.7 * pow(sin(smoothIter * 0.3) * 0.5 + 0.5, 2.0));
    // Far-outside points escape at once: keep them dark so the set's filaments carry the image.
    alpha = smoothstep(3.0, 14.0, smoothIter);
  }
  textureStore(outTex, vec2i(gid.xy), vec4f(color, alpha));
}

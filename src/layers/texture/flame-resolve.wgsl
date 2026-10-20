// Histogram → HDR texture with log-density tone mapping and gamma, the classic flame look.

import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Params {
  width: u32,
  height: u32,
  scale: f32,        // 1 / expected count per texel
  gamma: f32,
  hue: f32,          // palette hue rotation applied on resolve
  brightness: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read> hist: array<u32>;
@group(0) @binding(2) var outTex: texture_storage_2d<rgba16float, write>;

@compute @workgroup_size(16, 16) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let idx = (gid.y * params.width + gid.x) * 4u;
  let count = f32(hist[idx + 3u]);
  let maxCount = max(f32(hist[params.width * params.height * 4u]), 1.0);
  var color = vec3f(0.0);
  var alpha = 0.0;
  if (count > 0.0) {
    let rgb = vec3f(f32(hist[idx]), f32(hist[idx + 1u]), f32(hist[idx + 2u])) / (count * 255.0);
    // Classic flame tone map: log density relative to the brightest texel this frame.
    let density = log(1.0 + count * params.scale) / log(1.0 + maxCount * params.scale);
    alpha = pow(clamp(density, 0.0, 1.0), params.gamma);
    // Rotate the two-tone palette into the session hue.
    let tint = hueToRgb(params.hue, 0.6, 1.0);
    color = mix(rgb, rgb * tint * 1.6, 0.35) * alpha * params.brightness;
  }
  textureStore(outTex, vec2i(gid.xy), vec4f(color, alpha));
}

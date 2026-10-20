// Bloom bright pass with a soft knee. Rendering into a half-resolution target
// through a linear sampler doubles as the first downsample.

import { luminanceThreshold } from "@vgpu/wgsl-std/color";

struct Params {
  threshold: f32,
  knee: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let color = textureSampleLevel(src, samp, uv, 0.0).rgb;
  return vec4f(luminanceThreshold(color, params.threshold, params.knee), 1.0);
}

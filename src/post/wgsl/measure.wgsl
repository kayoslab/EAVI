// Luminance limiter state, one texel: x = limited mean, y = measured mean.
// Measures perceived (tone-mapped) mean luminance over a coarse grid and lets the
// limited value follow it only at a bounded rate upward. finish.wgsl applies
// gain = limited / measured, so no frame can brighten faster than the slew.

import { luminance, tonemapAces } from "@vgpu/wgsl-std/color";

struct Params {
  slewUp: f32,
  slewDown: f32,
  agcTarget: f32,   // desired perceived mean luminance
  agcRate: f32,     // per-frame adaptation toward the target gain (0 disables)
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var prev: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;

const GRID: i32 = 12;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sum = 0.0;
  for (var y = 0; y < GRID; y++) {
    for (var x = 0; x < GRID; x++) {
      let p = (vec2f(f32(x), f32(y)) + 0.5) / f32(GRID);
      let c = textureSampleLevel(src, samp, p, 0.0).rgb;
      sum += luminance(tonemapAces(max(c, vec3f(0.0))));
    }
  }
  let measured = sum / f32(GRID * GRID);
  let state = textureLoad(prev, vec2i(0, 0), 0);
  let previous = state.x;
  let delta = clamp(measured - previous, -params.slewDown, params.slewUp);
  let limited = max(previous + delta, 0.0);
  // Slow automatic gain: scenes may not sit far above the target; adaptation is gradual both ways.
  var agc = select(state.z, 1.0, state.z <= 0.0);
  if (params.agcRate > 0.0) {
    let wanted = clamp(params.agcTarget / max(measured, 0.01), 0.3, 1.6);
    agc = agc + (wanted - agc) * params.agcRate;
  } else {
    agc = 1.0;
  }
  return vec4f(limited, measured, agc, 1.0);
}

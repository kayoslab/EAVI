// After-image feedback: the new scene plus a damped, slightly zoomed copy of the
// previous combined frame. Writes into the history ping-pong "write" target.

struct Params {
  damp: f32,
  zoom: f32,
  rotate: f32,
  pad0: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var history: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let current = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  let c = uv - 0.5;
  let cs = cos(params.rotate);
  let sn = sin(params.rotate);
  let rotated = vec2f(c.x * cs - c.y * sn, c.x * sn + c.y * cs);
  let prevUv = rotated * (1.0 - params.zoom) + 0.5;
  var prev = textureSampleLevel(history, samp, prevUv, 0.0).rgb * params.damp;
  // Keep trails finite: a hard ceiling stops feedback + bloom from running away.
  prev = min(prev, vec3f(4.0));
  return vec4f(max(current, prev), 1.0);
}

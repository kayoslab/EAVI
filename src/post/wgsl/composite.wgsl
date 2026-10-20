// HDR composite: scene + bloom tiers, exposure and the one-shot intro fade.
// Output stays linear HDR; tone mapping and display encoding happen in finish.wgsl.

struct Params {
  bloomNear: f32,
  bloomFar: f32,
  exposure: f32,
  fade: f32,
}

@group(0) @binding(0) var scene: texture_2d<f32>;
@group(0) @binding(1) var bloomNear: texture_2d<f32>;
@group(0) @binding(2) var bloomFar: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;
@group(0) @binding(4) var<uniform> params: Params;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var color = textureSampleLevel(scene, samp, uv, 0.0).rgb;
  color += textureSampleLevel(bloomNear, samp, uv, 0.0).rgb * params.bloomNear;
  color += textureSampleLevel(bloomFar, samp, uv, 0.0).rgb * params.bloomFar;
  color *= params.exposure * params.fade;
  return vec4f(color, 1.0);
}

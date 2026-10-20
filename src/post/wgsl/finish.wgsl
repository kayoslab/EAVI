// Display pass: limiter gain, colour bleed, ACES, palette ramp grade, hue rotation,
// scanlines, vignette, grain, ordered dither, sRGB encode.

import { linearToSrgb3, luminance, tonemapAces } from "@vgpu/wgsl-std/color";
import { pcg3d, unitFloat } from "@vgpu/wgsl-std/hash";

struct Params {
  resolution: vec2f,
  texel: vec2f,
  ramp0: vec4f,
  ramp1: vec4f,
  ramp2: vec4f,
  ramp3: vec4f,
  frame: u32,
  bleed: f32,
  scanlineIntensity: f32,
  scanlineCount: f32,
  vignette: f32,
  grain: f32,
  dither: f32,
  rampStrength: f32,
  hueShift: f32,
  limiterEnabled: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var lumi: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var<uniform> params: Params;

const PI: f32 = 3.14159265359;

fn rampColor(t: f32) -> vec3f {
  let x = clamp(t, 0.0, 1.0) * 3.0;
  let i = floor(x);
  let f = x - i;
  if (i < 1.0) { return mix(params.ramp0.rgb, params.ramp1.rgb, f); }
  if (i < 2.0) { return mix(params.ramp1.rgb, params.ramp2.rgb, f); }
  return mix(params.ramp2.rgb, params.ramp3.rgb, min(f + step(3.0, x), 1.0));
}

// Hue rotation in YIQ space.
fn hueRotate(c: vec3f, angle: f32) -> vec3f {
  let yiq = mat3x3f(
    vec3f(0.299, 0.596, 0.211),
    vec3f(0.587, -0.274, -0.523),
    vec3f(0.114, -0.322, 0.312),
  ) * c;
  let cs = cos(angle);
  let sn = sin(angle);
  let rot = vec3f(yiq.x, yiq.y * cs - yiq.z * sn, yiq.y * sn + yiq.z * cs);
  return mat3x3f(
    vec3f(1.0, 1.0, 1.0),
    vec3f(0.956, -0.272, -1.106),
    vec3f(0.621, -0.647, 1.703),
  ) * rot;
}

fn bayer4(p: vec2u) -> f32 {
  let x = p.x & 3u;
  let y = p.y & 3u;
  let idx = (y << 2u) | x;
  var m = array<f32, 16>(0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0, 3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
  return (m[idx] + 0.5) / 16.0;
}

@fragment fn fs_main(@builtin(position) fragCoord: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSampleLevel(src, samp, uv, 0.0).rgb;

  if (params.bleed > 0.0) {
    let dx = vec2f(params.texel.x * 2.5, 0.0);
    let left = textureSampleLevel(src, samp, uv - dx, 0.0).rgb;
    let right = textureSampleLevel(src, samp, uv + dx, 0.0).rgb;
    // Analog smear: red leaks left, blue leaks right.
    let smeared = vec3f(left.r, 0.5 * (left.g + right.g), right.b);
    c = mix(c, smeared, params.bleed * 0.6);
  }

  // Luminance limiter: only ever attenuates sudden rises.
  let state = textureLoad(lumi, vec2i(0, 0), 0);
  let limiter = select(1.0, min(1.0, (state.x + 0.002) / (state.y + 0.002)), params.limiterEnabled > 0.5);
  let agc = select(state.z, 1.0, state.z <= 0.0);
  c *= limiter * agc;

  var m = tonemapAces(max(c, vec3f(0.0)));

  if (params.rampStrength > 0.0) {
    let graded = rampColor(luminance(m));
    m = mix(m, graded, params.rampStrength);
  }
  if (abs(params.hueShift) > 0.0001) {
    m = clamp(hueRotate(m, params.hueShift), vec3f(0.0), vec3f(1.0));
  }

  if (params.scanlineIntensity > 0.0) {
    let s = sin(uv.y * params.scanlineCount * PI);
    m *= 1.0 - params.scanlineIntensity * s * s;
  }

  let d = (uv - 0.5) * vec2f(params.resolution.x / max(params.resolution.y, 1.0), 1.0);
  m *= 1.0 - params.vignette * smoothstep(0.45, 1.25, length(d) * 1.35);

  if (params.grain > 0.0) {
    let px = vec3u(u32(fragCoord.x), u32(fragCoord.y), params.frame);
    let n = unitFloat(pcg3d(px).x);
    m += (n - 0.5) * params.grain;
  }

  if (params.dither > 0.0) {
    let levels = mix(64.0, 5.0, params.dither);
    let b = bayer4(vec2u(u32(fragCoord.x), u32(fragCoord.y))) - 0.5;
    m = floor(m * levels + b) / levels;
  }

  return vec4f(linearToSrgb3(clamp(m, vec3f(0.0), vec3f(1.0))), 1.0);
}

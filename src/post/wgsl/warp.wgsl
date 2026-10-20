// Screen-space UV warp: pixelation → CRT barrel → kaleidoscope fold → chromatic sampling.
// Operates on linear HDR; every stage is identity at zero.

struct Params {
  resolution: vec2f,
  segments: f32,
  angle: f32,
  rgbShift: f32,
  barrel: f32,
  pixelSize: f32,
  kaleidoMix: f32,
}

@group(0) @binding(0) var src: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> params: Params;

const TAU: f32 = 6.28318530718;

fn mirrorRepeat(x: vec2f) -> vec2f {
  return 1.0 - abs(fract(x * 0.5) * 2.0 - 1.0);
}

fn pixelate(uv: vec2f) -> vec2f {
  if (params.pixelSize < 1.0) {
    return uv;
  }
  let cell = params.pixelSize / params.resolution;
  return (floor(uv / cell) + 0.5) * cell;
}

// Barrel-distorted UV and a mask that is 0 outside the curved screen.
fn barrel(uv: vec2f) -> vec3f {
  if (params.barrel <= 0.0) {
    return vec3f(uv, 1.0);
  }
  let c = (uv - 0.5) * 2.0;
  let r2 = dot(c, c);
  let k = params.barrel;
  let distorted = c * (1.0 + k * r2) / (1.0 + k * 2.0 * 0.5);
  let outUv = distorted * 0.5 + 0.5;
  let inside = step(0.0, outUv.x) * step(outUv.x, 1.0) * step(0.0, outUv.y) * step(outUv.y, 1.0);
  // Soft edge so the screen border does not alias.
  let edge = min(min(outUv.x, 1.0 - outUv.x), min(outUv.y, 1.0 - outUv.y));
  let soft = smoothstep(0.0, 0.006, edge);
  return vec3f(outUv, inside * soft);
}

fn kaleidoscope(uv: vec2f) -> vec2f {
  if (params.segments < 1.0 || params.kaleidoMix <= 0.0) {
    return uv;
  }
  let aspect = params.resolution.x / max(params.resolution.y, 1.0);
  let p = (uv - 0.5) * vec2f(aspect, 1.0);
  let r = length(p);
  var a = atan2(p.y, p.x) + params.angle;
  let seg = TAU / params.segments;
  a = a - seg * floor(a / seg);
  if (a > seg * 0.5) {
    a = seg - a;
  }
  let q = r * vec2f(cos(a), sin(a));
  return mirrorRepeat(q / vec2f(aspect, 1.0) + 0.5);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let uv1 = pixelate(uv);
  let b = barrel(uv1);
  let folded = kaleidoscope(b.xy);
  // Glide between the plain and the folded image; no fold ever appears in one frame.
  let uv3 = mix(b.xy, folded, clamp(params.kaleidoMix, 0.0, 1.0));
  let dir = (uv3 - 0.5) * params.rgbShift;
  let r = textureSampleLevel(src, samp, uv3 + dir, 0.0).r;
  let g = textureSampleLevel(src, samp, uv3, 0.0).g;
  let bl = textureSampleLevel(src, samp, uv3 - dir, 0.0).b;
  return vec4f(vec3f(r, g, bl) * b.z, 1.0);
}

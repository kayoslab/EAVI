// Fractal flame chaos game: every thread owns one wandering point. Each frame it
// takes K steps through a seeded iterated-function system with classic flame
// variations and splats colour + count into a histogram with atomics.

import { hashU32, unitFloat } from "@vgpu/wgsl-std/hash";

struct Params {
  width: u32,
  height: u32,
  count: u32,
  steps: u32,
  time: f32,
  bass: f32,
  treble: f32,
  zoom: f32,
  // Four functions: coef = (a, b, c, d), off = (e, f, variation, weight), col = (r, g, b, _)
  coef0: vec4f, off0: vec4f, col0: vec4f,
  coef1: vec4f, off1: vec4f, col1: vec4f,
  coef2: vec4f, off2: vec4f, col2: vec4f,
  coef3: vec4f, off3: vec4f, col3: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> points: array<vec4f>;   // x, y, colour index, rng (as f32 bits)
@group(0) @binding(2) var<storage, read_write> hist: array<atomic<u32>>;

const PI: f32 = 3.14159265359;

fn variation(id: u32, p: vec2f) -> vec2f {
  let r2 = dot(p, p);
  let r = sqrt(r2);
  let theta = atan2(p.x, p.y);
  switch (id) {
    case 1u: { return sin(p); }                                                   // sinusoidal
    case 2u: { return p / (r2 + 0.0001); }                                       // spherical
    case 3u: { let c = cos(r2); let s = sin(r2); return vec2f(p.x * s - p.y * c, p.x * c + p.y * s); } // swirl
    case 4u: { let a = 2.0 * theta; return r * vec2f(cos(a), sin(a)) * 0.5 / max(r, 0.0001); }         // horseshoe-ish
    case 5u: { return vec2f(theta / PI, r - 1.0); }                                                      // polar
    case 6u: { return r * vec2f(sin(theta + r), cos(theta - r)); }                                       // handkerchief
    case 7u: { let a = theta * r; return r * vec2f(sin(a), -cos(a)); }                                   // heart
    case 8u: { let a = theta / PI; return a * vec2f(sin(PI * r), cos(PI * r)); }                         // disc
    case 9u: { return vec2f(cos(theta) + sin(r), sin(theta) - cos(r)) / max(r, 0.05); }                  // spiral
    default: { return p; }                                                                               // linear
  }
}

fn applyFn(i: u32, p: vec2f) -> vec3f {
  var coef: vec4f;
  var off: vec4f;
  var col: vec4f;
  switch (i) {
    case 0u: { coef = params.coef0; off = params.off0; col = params.col0; }
    case 1u: { coef = params.coef1; off = params.off1; col = params.col1; }
    case 2u: { coef = params.coef2; off = params.off2; col = params.col2; }
    default: { coef = params.coef3; off = params.off3; col = params.col3; }
  }
  // Bass gently rotates and scales every map; the whole flame breathes with the music.
  let ang = params.bass * 0.18 * sin(params.time * 0.7 + f32(i));
  let cs = cos(ang);
  let sn = sin(ang);
  let a = coef.x * cs - coef.y * sn;
  let b = coef.x * sn + coef.y * cs;
  let c = coef.z * cs - coef.w * sn;
  let d = coef.z * sn + coef.w * cs;
  let affine = vec2f(a * p.x + b * p.y + off.x, c * p.x + d * p.y + off.y);
  let v = variation(u32(off.z), affine);
  return vec3f(v, col.w);
}

@compute @workgroup_size(256) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  var st = points[i];
  var p = st.xy;
  var ci = st.z;
  var rng = bitcast<u32>(st.w);
  let w0 = params.off0.w;
  let w1 = w0 + params.off1.w;
  let w2 = w1 + params.off2.w;
  let wsum = w2 + params.off3.w;
  let fw = f32(params.width);
  let fh = f32(params.height);

  for (var k = 0u; k < params.steps; k++) {
    rng = hashU32(rng + 0x9e3779b9u);
    let u = unitFloat(rng) * wsum;
    var fi = 3u;
    if (u < w0) { fi = 0u; } else if (u < w1) { fi = 1u; } else if (u < w2) { fi = 2u; }
    let res = applyFn(fi, p);
    p = res.xy;
    ci = (ci + res.z) * 0.5;

    // Escape guard: a divergent point is re-seeded inside the unit square.
    if (!(abs(p.x) < 1e4 && abs(p.y) < 1e4)) {
      rng = hashU32(rng);
      p = vec2f(unitFloat(rng), unitFloat(hashU32(rng))) * 2.0 - 1.0;
      ci = unitFloat(rng);
      continue;
    }

    // Plot (final transform: a mild zoom with a touch of treble jitter).
    let q = p * params.zoom * (1.0 + params.treble * 0.02 * sin(f32(k) * 1.3 + params.time * 5.0));
    let px = (q.x * 0.5 + 0.5) * fw;
    let py = (q.y * 0.5 * (fw / fh) + 0.5) * fh;
    if (px >= 0.0 && px < fw && py >= 0.0 && py < fh) {
      let idx = (u32(py) * params.width + u32(px)) * 4u;
      // Colour index → two-tone palette in [0,1]; stored as 8-bit fixed point.
      let t = clamp(ci, 0.0, 1.0);
      let rgb = mix(vec3f(0.95, 0.2, 0.75), vec3f(0.15, 0.85, 1.0), t);
      atomicAdd(&hist[idx], u32(rgb.r * 255.0));
      atomicAdd(&hist[idx + 1u], u32(rgb.g * 255.0));
      atomicAdd(&hist[idx + 2u], u32(rgb.b * 255.0));
      let newCount = atomicAdd(&hist[idx + 3u], 1u) + 1u;
      // Frame maximum lives just past the texel data; resolve normalises against it.
      atomicMax(&hist[params.width * params.height * 4u], newCount);
    }
  }
  points[i] = vec4f(p, ci, bitcast<f32>(rng));
}

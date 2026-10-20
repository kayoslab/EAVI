// Curl-noise advection: divergence-free flow from the curl of a simplex potential,
// so particles stream along coherent, never-crossing ribbons. Bass stirs, treble sparkles.

import { pcg3d, unitFloat } from "@vgpu/wgsl-std/hash";
import { simplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct Params {
  dt: f32,
  time: f32,
  bass: f32,
  treble: f32,
  scale: f32,       // noise frequency
  speed: f32,
  radius: f32,      // respawn radius / soft bound
  pad0: f32,
  count: u32,
  seed: u32,
  pad1: u32,
  pad2: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;

fn potential(p: vec3f) -> vec3f {
  let t = params.time * 0.05;
  return vec3f(
    simplex3d(p + vec3f(0.0, t, 31.7)),
    simplex3d(p + vec3f(17.3, 0.0, t)),
    simplex3d(p + vec3f(t, 43.1, 0.0)),
  );
}

fn curl(p: vec3f) -> vec3f {
  let e = 0.05;
  let dx = potential(p + vec3f(e, 0.0, 0.0)) - potential(p - vec3f(e, 0.0, 0.0));
  let dy = potential(p + vec3f(0.0, e, 0.0)) - potential(p - vec3f(0.0, e, 0.0));
  let dz = potential(p + vec3f(0.0, 0.0, e)) - potential(p - vec3f(0.0, 0.0, e));
  return vec3f(dy.z - dz.y, dz.x - dx.z, dx.y - dy.x) / (2.0 * e);
}

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  var p = particles[i];
  var pos = p.xyz;
  var life = p.w - params.dt * 0.25;
  let v = curl(pos * params.scale) * params.speed * (1.0 + params.bass * 0.6);
  // Gentle pull toward the origin keeps the cloud in frame.
  pos = pos + (v - pos * 0.15) * params.dt;
  let outside = dot(pos, pos) > params.radius * params.radius * 4.0;
  if (life <= 0.0 || outside) {
    let h = pcg3d(vec3u(i, params.seed, u32(params.time * 60.0) + i * 3u));
    let r = vec3f(unitFloat(h.x), unitFloat(h.y), unitFloat(h.z)) * 2.0 - 1.0;
    pos = r * params.radius;
    life = 1.0 + unitFloat(h.x ^ h.y) * 3.0;
  }
  particles[i] = vec4f(pos, life);
}

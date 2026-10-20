// One thread per particle: integrates a Lorenz attractor with a midpoint step,
// ages the particle, and respawns it near the attractor when its life ends or
// it escapes. Positions stay in attractor space; the draw shader scales them.

import { pcg3d, unitFloat } from "@vgpu/wgsl-std/hash";

struct Params {
  dt: f32,
  time: f32,
  bass: f32,
  treble: f32,
  sigma: f32,
  rho: f32,
  beta: f32,
  respawnRadius: f32,
  count: u32,
  seed: u32,
  pad0: u32,
  pad1: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> particles: array<vec4f>;

fn lorenz(p: vec3f) -> vec3f {
  // Bass widens the attractor by nudging rho; treble adds a faint jitter to sigma.
  let rho = params.rho * (1.0 + params.bass * 0.18);
  let sigma = params.sigma * (1.0 + params.treble * 0.05);
  return vec3f(
    sigma * (p.y - p.x),
    p.x * (rho - p.z) - p.y,
    p.x * p.y - params.beta * p.z,
  );
}

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  let p = particles[i];
  var pos = p.xyz;
  var life = p.w - params.dt * 0.35;

  let k1 = lorenz(pos);
  let mid = pos + k1 * (params.dt * 0.5);
  let k2 = lorenz(mid);
  pos = pos + k2 * params.dt;

  let inside = all(abs(pos) < vec3f(400.0));
  if (life <= 0.0 || !inside) {
    let h = pcg3d(vec3u(i, params.seed, u32(params.time * 60.0) + i * 7u));
    let r = vec3f(unitFloat(h.x), unitFloat(h.y), unitFloat(h.z)) * 2.0 - 1.0;
    pos = vec3f(0.0, 0.0, 25.0) + r * params.respawnRadius;
    life = 0.6 + unitFloat(h.x ^ h.z) * 2.4;
  }
  particles[i] = vec4f(pos, life);
}

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
  family: u32,     // 0 lorenz, 1 thomas, 2 aizawa, 3 halvorsen
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

fn thomas(p: vec3f) -> vec3f {
  let b = 0.208 - params.bass * 0.03;
  return (vec3f(sin(p.y), sin(p.z), sin(p.x)) - b * p) * 6.0;
}

fn aizawa(p: vec3f) -> vec3f {
  let a = 0.95; let b = 0.7; let c = 0.6; let d = 3.5; let e = 0.25; let f = 0.1 + params.bass * 0.02;
  return vec3f(
    (p.z - b) * p.x - d * p.y,
    d * p.x + (p.z - b) * p.y,
    c + a * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x,
  ) * 3.0;
}

fn halvorsen(p: vec3f) -> vec3f {
  let a = 1.89 - params.bass * 0.15;
  return vec3f(
    -a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
    -a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
    -a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x,
  ) * 1.6;
}

fn flow(p: vec3f) -> vec3f {
  switch (params.family) {
    case 1u: { return thomas(p); }
    case 2u: { return aizawa(p); }
    case 3u: { return halvorsen(p); }
    default: { return lorenz(p); }
  }
}

@compute @workgroup_size(64) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= params.count) {
    return;
  }
  let p = particles[i];
  var pos = p.xyz;
  var life = p.w - params.dt * 0.35;

  let k1 = flow(pos);
  let mid = pos + k1 * (params.dt * 0.5);
  let k2 = flow(mid);
  pos = pos + k2 * params.dt;

  let inside = all(abs(pos) < vec3f(400.0));
  if (life <= 0.0 || !inside) {
    let h = pcg3d(vec3u(i, params.seed, u32(params.time * 60.0) + i * 7u));
    let r = vec3f(unitFloat(h.x), unitFloat(h.y), unitFloat(h.z)) * 2.0 - 1.0;
    let home = select(vec3f(0.0), vec3f(0.0, 0.0, 25.0), params.family == 0u);
    pos = home + r * params.respawnRadius;
    life = 0.6 + unitFloat(h.x ^ h.z) * 2.4;
  }
  particles[i] = vec4f(pos, life);
}

// Raymarched 3D fractal family drawn as a fullscreen triangle with real depth:
// Mandelbulb, Mandelbox, quaternion Julia, Apollonian gasket, Sierpinski tetrahedron.
// Orbit traps colour the surface; parameters drift slowly so the shape breathes.

import { fullscreenTriangleClip } from "@vgpu/wgsl-std/fullscreen";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";
import { rotateX, rotateY } from "../../wgsl/lib/transform.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Params {
  juliaC: vec4f,
  family: u32,        // 0 bulb, 1 box, 2 julia, 3 apollonian, 4 sierpinski
  iterations: u32,
  steps: u32,
  pad0: u32,
  scale: f32,
  power: f32,         // mandelbulb power / mandelbox scale / apollonian s
  bass: f32,
  treble: f32,
  hue: f32,
  saturation: f32,
  fogDensity: f32,
  rotation: f32,
  opacity: f32,
  glow: f32,
  warm: f32,          // 0 session palette, 1 warm indigo→amber ramp
  pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> params: Params;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let clip = fullscreenTriangleClip(index);
  return VertexOut(clip, clip.xy);
}

struct Hit {
  d: f32,
  trap: f32,
}

fn qmul(a: vec4f, b: vec4f) -> vec4f {
  return vec4f(
    a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
    a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
    a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
    a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x,
  );
}

fn deBulb(p: vec3f) -> Hit {
  var z = p;
  var dr = 1.0;
  var r = 0.0;
  var trap = 1e9;
  let power = params.power;
  for (var i = 0u; i < params.iterations; i++) {
    r = length(z);
    if (r > 2.0) { break; }
    let theta = acos(clamp(z.z / r, -1.0, 1.0)) * power;
    let phi = atan2(z.y, z.x) * power;
    dr = pow(r, power - 1.0) * power * dr + 1.0;
    let zr = pow(r, power);
    z = zr * vec3f(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + p;
    trap = min(trap, length(z));
  }
  return Hit(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

fn deBox(p: vec3f) -> Hit {
  var z = p;
  var dr = 1.0;
  var trap = 1e9;
  let scale = params.power;
  let minR2 = 0.25;
  let fixedR2 = 1.0;
  for (var i = 0u; i < params.iterations; i++) {
    z = clamp(z, vec3f(-1.0), vec3f(1.0)) * 2.0 - z;
    let r2 = dot(z, z);
    if (r2 < minR2) {
      let t = fixedR2 / minR2;
      z *= t; dr *= t;
    } else if (r2 < fixedR2) {
      let t = fixedR2 / r2;
      z *= t; dr *= t;
    }
    z = scale * z + p;
    dr = dr * abs(scale) + 1.0;
    trap = min(trap, r2);
  }
  return Hit(length(z) / abs(dr), sqrt(trap));
}

fn deJulia(p: vec3f) -> Hit {
  var z = vec4f(p, 0.0);
  var dz = vec4f(1.0, 0.0, 0.0, 0.0);
  var trap = 1e9;
  var m2 = 0.0;
  for (var i = 0u; i < params.iterations; i++) {
    dz = 2.0 * qmul(z, dz);
    z = qmul(z, z) + params.juliaC;
    m2 = dot(z, z);
    trap = min(trap, m2);
    if (m2 > 16.0) { break; }
  }
  let m = sqrt(m2);
  return Hit(0.25 * log(max(m2, 1e-6)) * m / max(length(dz), 1e-6), sqrt(trap));
}

fn deApollonian(p0: vec3f) -> Hit {
  var p = p0;
  var scale = 1.0;
  var trap = 1e9;
  let s = params.power;
  for (var i = 0u; i < min(params.iterations, 9u); i++) {
    p = -1.0 + 2.0 * fract(0.5 * p + 0.5);
    let r2 = dot(p, p);
    let k = s / max(r2, 1e-5);
    p *= k;
    scale *= k;
    trap = min(trap, r2);
  }
  let d = 0.25 * abs(p.y) / scale;
  // Keep the infinite gasket inside a sphere so it reads as an object.
  return Hit(max(d, length(p0) - 1.35), trap);
}

fn deSierpinski(p: vec3f) -> Hit {
  var z = p;
  var n = 0u;
  var trap = 1e9;
  for (; n < params.iterations; n++) {
    if (z.x + z.y < 0.0) { z = vec3f(-z.y, -z.x, z.z); }
    if (z.x + z.z < 0.0) { z = vec3f(-z.z, z.y, -z.x); }
    if (z.y + z.z < 0.0) { z = vec3f(z.x, -z.z, -z.y); }
    z = z * 2.0 - 1.0;
    trap = min(trap, length(z));
  }
  return Hit(length(z) * pow(2.0, -f32(n)), trap);
}

fn sceneSdf(p: vec3f) -> Hit {
  let q = p / params.scale;
  var h: Hit;
  switch (params.family) {
    case 0u: { h = deBulb(q); }
    case 1u: { h = deBox(q * 2.4); h.d /= 2.4; }
    case 2u: { h = deJulia(q); }
    case 3u: { h = deApollonian(q); }
    default: { h = deSierpinski(q); }
  }
  h.d *= params.scale;
  return h;
}

fn normalAt(p: vec3f, eps: f32) -> vec3f {
  let e = vec2f(eps, 0.0);
  return normalize(vec3f(
    sceneSdf(p + e.xyy).d - sceneSdf(p - e.xyy).d,
    sceneSdf(p + e.yxy).d - sceneSdf(p - e.yxy).d,
    sceneSdf(p + e.yyx).d - sceneSdf(p - e.yyx).d,
  ));
}

fn warmRamp(t: f32) -> vec3f {
  let indigo = vec3f(0.07, 0.09, 0.48);
  let magenta = vec3f(0.88, 0.24, 0.52);
  let amber = vec3f(1.0, 0.58, 0.18);
  let x = clamp(t, 0.0, 1.0) * 2.0;
  if (x < 1.0) { return mix(indigo, magenta, x); }
  return mix(magenta, amber, x - 1.0);
}

struct FragmentOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
}

@fragment fn fs_main(in: VertexOut) -> FragmentOut {
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let back = vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  let dirWorld = normalize(right * (in.ndc.x / camera.projection[0][0]) + up * (in.ndc.y / camera.projection[1][1]) - back);

  let rot = rotateY(params.rotation) * rotateX(params.rotation * 0.41);
  let invRot = transpose(rot);
  let ro = invRot * camera.position;
  let rd = invRot * dirWorld;

  var t = 0.0;
  var hit = false;
  var trap = 0.0;
  var steps = 0.0;
  let maxDist = 30.0;
  for (var i = 0u; i < params.steps; i++) {
    let p = ro + rd * t;
    let h = sceneSdf(p);
    let eps = 0.0008 * (1.0 + t);
    if (h.d < eps) {
      hit = true;
      trap = h.trap;
      break;
    }
    t += h.d * 0.8;
    steps += 1.0;
    if (t > maxDist) { break; }
  }
  if (!hit) {
    discard;
  }

  let pObj = ro + rd * t;
  let n = normalAt(pObj, 0.0012 * (1.0 + t));
  let viewDir = -rd;
  let facing = max(dot(n, viewDir), 0.0);
  let fresnel = pow(1.0 - facing, 3.0);
  // Cheap ambient occlusion from the step count: crevices took more steps.
  let ao = pow(clamp(1.0 - steps / f32(params.steps) * 1.25, 0.04, 1.0), 1.4);
  let trapT = clamp(trap * 0.9, 0.0, 1.0);

  let sessionBody = hueToRgb(params.hue + trapT * 80.0, params.saturation, 0.55 + 0.45 * facing);
  let body = mix(sessionBody, warmRamp(trapT), params.warm);
  let rim = hueToRgb(params.hue + 170.0, min(1.0, params.saturation + 0.2), 1.0);
  // Detail comes from the trap and the occlusion, not from a flat lit body.
  var color = body * (0.06 + 0.42 * facing) * ao * (0.35 + 0.65 * trapT) + rim * fresnel * ao * (0.25 + params.bass * 0.3);
  color *= params.glow;

  let fog = exp(-params.fogDensity * t);
  color *= fog * params.opacity;

  let hitWorld = rot * pObj;
  let viewPos = camera.view * vec4f(hitWorld, 1.0);
  let clip = camera.projection * viewPos;

  var out: FragmentOut;
  out.color = vec4f(color, 1.0);
  out.depth = clamp(clip.z / clip.w, 0.0, 1.0);
  return out;
}

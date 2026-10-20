// Raymarched Menger sponge drawn as a fullscreen triangle into the depth-tested
// scene target. Writes frag_depth so point layers composite correctly against it.

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
  iterations: u32,
  scale: f32,
  bass: f32,
  treble: f32,
  hue: f32,
  saturation: f32,
  fogDensity: f32,
  rotation: f32,
  opacity: f32,
  glow: f32,
  pad0: f32,
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

fn sdBox(p: vec3f, b: vec3f) -> f32 {
  let q = abs(p) - b;
  return length(max(q, vec3f(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
}

fn mod2(x: vec3f) -> vec3f {
  return x - 2.0 * floor(x * 0.5);
}

// Returns (distance, orbit trap).
fn menger(p: vec3f) -> vec2f {
  var d = sdBox(p, vec3f(1.0));
  var s = 1.0;
  var trap = 1e9;
  let fold = 1.0 + params.treble * 0.04;
  for (var m = 0u; m < params.iterations; m++) {
    let a = mod2(p * s + 1.0) - 1.0;
    s *= 3.0;
    let r = abs(fold - 3.0 * abs(a));
    let da = max(r.x, r.y);
    let db = max(r.y, r.z);
    let dc = max(r.z, r.x);
    let c = (min(da, min(db, dc)) - 1.0) / s;
    d = max(d, c);
    trap = min(trap, dot(a, a));
  }
  return vec2f(d, trap);
}

fn sceneSdf(p: vec3f) -> vec2f {
  let r = menger(p / params.scale);
  return vec2f(r.x * params.scale, r.y);
}

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.0007, 0.0);
  return normalize(vec3f(
    sceneSdf(p + e.xyy).x - sceneSdf(p - e.xyy).x,
    sceneSdf(p + e.yxy).x - sceneSdf(p - e.yxy).x,
    sceneSdf(p + e.yyx).x - sceneSdf(p - e.yyx).x,
  ));
}

struct FragmentOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
}

@fragment fn fs_main(in: VertexOut) -> FragmentOut {
  // Camera basis from the view matrix rows (world-space right/up/back).
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let back = vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  let dirWorld = normalize(
    right * (in.ndc.x / camera.projection[0][0]) +
    up * (in.ndc.y / camera.projection[1][1]) -
    back,
  );

  // Object rotation: march in object space.
  let rot = rotateY(params.rotation) * rotateX(params.rotation * 0.37);
  let invRot = transpose(rot);
  let ro = invRot * camera.position;
  let rd = invRot * dirWorld;

  var t = 0.0;
  var hit = false;
  var trap = 0.0;
  let maxDist = 40.0;
  for (var i = 0; i < 110; i++) {
    let p = ro + rd * t;
    let r = sceneSdf(p);
    let eps = 0.0006 * (1.0 + t);
    if (r.x < eps) {
      hit = true;
      trap = r.y;
      break;
    }
    t += r.x * 0.9;
    if (t > maxDist) {
      break;
    }
  }
  if (!hit) {
    discard;
  }

  let pObj = ro + rd * t;
  let n = normalAt(pObj);
  let viewDir = -rd;
  let fresnel = pow(1.0 - max(dot(n, viewDir), 0.0), 3.0);
  let facing = max(dot(n, viewDir), 0.0);
  let trapT = clamp(sqrt(trap) * 1.4, 0.0, 1.0);

  // Emissive palette: body tone from the trap, rim in a shifted hue, bass lifts the glow.
  let body = hueToRgb(params.hue + trapT * 70.0, params.saturation, 0.55 + 0.45 * facing);
  let rim = hueToRgb(params.hue + 160.0, min(1.0, params.saturation + 0.2), 1.0);
  var color = body * (0.25 + 0.55 * facing) + rim * fresnel * (0.6 + params.bass * 0.8);
  color *= params.glow;

  let fog = exp(-params.fogDensity * t);
  color *= fog * params.opacity;

  // Depth of the hit in the real world frame.
  let hitWorld = rot * pObj;
  let viewPos = camera.view * vec4f(hitWorld, 1.0);
  let clip = camera.projection * viewPos;

  var out: FragmentOut;
  out.color = vec4f(color, 1.0);
  out.depth = clamp(clip.z / clip.w, 0.0, 1.0);
  return out;
}

// Raymarched hyper-tunnel: a kaleidoscopically folded tube that extends ahead
// of the camera along its view axis, walls scored by glowing Tron grooves.
// Writes depth so subjects and particles sit inside it correctly.

import { fullscreenTriangleClip } from "@vgpu/wgsl-std/fullscreen";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Tunnel {
  radius: f32,
  segments: f32,
  scroll: f32,
  twist: f32,
  bass: f32,
  treble: f32,
  beat: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  fogDensity: f32,
  opacity: f32,
  ripple: f32,
  time: f32,
  wallMix: f32,      // 0 = plain grooves, 1 = texture-lit walls
  pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> tunnel: Tunnel;
@group(0) @binding(2) var wallTex: texture_2d<f32>;
@group(0) @binding(3) var wallSamp: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) ndc: vec2f,
}

@vertex fn vs_main(@builtin(vertex_index) index: u32) -> VertexOut {
  let clip = fullscreenTriangleClip(index);
  return VertexOut(clip, clip.xy);
}

const TAU: f32 = 6.28318530718;

// Fold the cross-section into `segments` mirrored wedges and return (wedge x, wedge y, folded angle).
fn fold(xy: vec2f, z: f32) -> vec3f {
  let r = length(xy);
  var a = atan2(xy.y, xy.x) + z * tunnel.twist;
  let seg = TAU / max(tunnel.segments, 3.0);
  a = a - seg * floor(a / seg);
  let folded = abs(a - seg * 0.5);
  return vec3f(r * cos(folded), r * sin(folded), folded);
}

// Signed distance to the tunnel interior (negative inside the open space is what we march in,
// so return distance to the wall as positive while inside).
fn sceneSdf(p: vec3f) -> f32 {
  let f = fold(p.xy, p.z);
  let z = p.z + tunnel.scroll;
  let groove = sin(z * 3.0) * sin(f.z * 9.0) * tunnel.ripple;
  let breathe = 1.0 + tunnel.bass * 0.12;
  let wall = tunnel.radius * breathe - f.x + groove;
  return wall;
}

fn normalAt(p: vec3f) -> vec3f {
  let e = vec2f(0.002, 0.0);
  return normalize(vec3f(
    sceneSdf(p + e.xyy) - sceneSdf(p - e.xyy),
    sceneSdf(p + e.yxy) - sceneSdf(p - e.yxy),
    sceneSdf(p + e.yyx) - sceneSdf(p - e.yyx),
  ));
}

struct FragmentOut {
  @location(0) color: vec4f,
  @builtin(frag_depth) depth: f32,
}

@fragment fn fs_main(in: VertexOut) -> FragmentOut {
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let back = vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  let forward = -back;
  let dirWorld = normalize(
    right * (in.ndc.x / camera.projection[0][0]) +
    up * (in.ndc.y / camera.projection[1][1]) +
    forward,
  );
  // Tunnel-local frame: axis = camera forward through a point behind the camera,
  // so the tube surrounds both the camera and the subject ahead of it.
  let axisOrigin = camera.position - forward * 6.0;
  let rdLocal = vec3f(dot(dirWorld, right), dot(dirWorld, up), dot(dirWorld, forward));
  let roLocal = vec3f(dot(camera.position - axisOrigin, right), dot(camera.position - axisOrigin, up), dot(camera.position - axisOrigin, forward));

  var t = 0.0;
  var hit = false;
  let maxDist = 60.0;
  for (var i = 0; i < 96; i++) {
    let p = roLocal + rdLocal * t;
    let d = sceneSdf(p);
    if (d < 0.002 * (1.0 + t * 0.5)) {
      hit = true;
      break;
    }
    t += max(d * 0.85, 0.01);
    if (t > maxDist) {
      break;
    }
  }
  if (!hit) {
    discard;
  }

  let pLocal = roLocal + rdLocal * t;
  let n = normalAt(pLocal);
  let f = fold(pLocal.xy, pLocal.z);
  let z = pLocal.z + tunnel.scroll;

  // Glowing grooves: rings along z and seams along the fold angle.
  let ring = pow(1.0 - abs(fract(z * 1.5) * 2.0 - 1.0), 12.0);
  let seam = pow(1.0 - abs(fract(f.z * 4.0 / TAU * max(tunnel.segments, 3.0)) * 2.0 - 1.0), 14.0);
  let lines = max(ring, seam * 0.8);
  let facing = max(dot(n, -rdLocal), 0.0);
  let base = hueToRgb(tunnel.hue + f.z * 40.0, tunnel.saturation, 1.0);
  let accent = hueToRgb(tunnel.hue + 180.0, min(1.0, tunnel.saturation + 0.2), 1.0);
  var color = base * (0.04 + 0.08 * facing) + accent * lines * (0.9 + tunnel.treble * 0.8) + base * lines * 0.4;
  // Optional fractal skin on the walls: unwrapped by fold angle and travel distance.
  let wallUv = vec2f(fract(z * 0.08), fract(f.z / 6.2831853 * max(tunnel.segments, 3.0) * 0.5 + 0.5));
  let skin = textureSampleLevel(wallTex, wallSamp, wallUv, 0.0);
  color = mix(color, color * 0.4 + skin.rgb * skin.a * (0.35 + 0.25 * facing) * (1.0 + tunnel.bass * 0.3), tunnel.wallMix);
  color *= tunnel.brightness;

  let fog = exp(-tunnel.fogDensity * t);
  color *= fog * tunnel.opacity;

  let hitWorld = camera.position + dirWorld * t;
  let viewPos = camera.view * vec4f(hitWorld, 1.0);
  let clip = camera.projection * viewPos;

  var out: FragmentOut;
  out.color = vec4f(color, 1.0);
  out.depth = clamp(clip.z / clip.w, 0.0, 1.0);
  return out;
}

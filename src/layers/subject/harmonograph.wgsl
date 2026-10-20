// Harmonograph: a damped Lissajous curve in 3D, generated per segment in the vertex
// stage. Frequencies sit near small-integer ratios so the figure breathes between
// closed shapes; audio slowly detunes it.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";
import { rotateX, rotateY } from "../../wgsl/lib/transform.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Harmo {
  freq: vec4f,        // fx1, fy1, fz1, fx2
  phase: vec4f,       // px, py, pz, p2
  resolution: vec2f,
  count: u32,
  scale: f32,
  damping: f32,
  span: f32,          // parameter range covered by the trace
  thickness: f32,
  tiltX: f32,
  tiltY: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  opacity: f32,
  time: f32,
  pad0: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> harmo: Harmo;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) t: f32,
}

fn point(i: u32) -> vec3f {
  let t = f32(i) / f32(harmo.count) * harmo.span;
  let d = exp(-harmo.damping * t);
  let x = sin(harmo.freq.x * t + harmo.phase.x) * d + 0.35 * sin(harmo.freq.w * t + harmo.phase.w) * d;
  let y = sin(harmo.freq.y * t + harmo.phase.y) * d;
  let z = sin(harmo.freq.z * t + harmo.phase.z) * d * 0.7;
  return rotateY(harmo.tiltY) * rotateX(harmo.tiltX) * (vec3f(x, y, z) * harmo.scale);
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let a = point(instance);
  let b = point(instance + 1u);
  let ca = camera.viewProjection * vec4f(a, 1.0);
  let cb = camera.viewProjection * vec4f(b, 1.0);
  let corner = vertex % 6u;
  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, harmo.thickness, harmo.resolution);
  out.across = lineQuadAcross(corner);
  let t = f32(instance) / f32(harmo.count);
  out.t = t;
  let shimmer = 1.0 + harmo.treble * 0.5 * sin(harmo.time * 6.0 + t * 40.0);
  out.color = hueToRgb(harmo.hue + t * 90.0, harmo.saturation, 1.0) * harmo.brightness * shimmer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.25, 1.0, abs(in.across));
  // The trace fades as the pen loses energy.
  let a = edge * (1.0 - in.t * 0.6) * harmo.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

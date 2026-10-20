// Vector scope: the live time-domain waveform wrapped around a ring in 3D,
// drawn as a continuous glowing trace. Works muted because analysis never stops.

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

struct Scope {
  resolution: vec2f,
  count: u32,
  radius: f32,
  gain: f32,
  thickness: f32,
  tiltX: f32,
  tiltY: f32,
  twist: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  opacity: f32,
  time: f32,
  pad0: f32,
}

@group(0) @binding(0) var<storage, read> samples: array<f32>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<uniform> scope: Scope;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
}

const TAU: f32 = 6.28318530718;

fn samplePoint(i: u32) -> vec3f {
  let n = f32(scope.count);
  let t = f32(i % scope.count) / n;
  let a = t * TAU;
  let v = samples[i % scope.count];
  let r = scope.radius + v * scope.gain;
  let z = v * scope.gain * 0.6 * sin(a * 3.0 + scope.twist);
  let p = vec3f(cos(a) * r, sin(a) * r, z);
  return rotateY(scope.tiltY) * rotateX(scope.tiltX) * p;
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let a = samplePoint(instance);
  let b = samplePoint(instance + 1u);
  let ca = camera.viewProjection * vec4f(a, 1.0);
  let cb = camera.viewProjection * vec4f(b, 1.0);
  let corner = vertex % 6u;

  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, scope.thickness, scope.resolution);
  out.across = lineQuadAcross(corner);
  let t = f32(instance) / f32(scope.count);
  let v = abs(samples[instance % scope.count]);
  out.color = hueToRgb(scope.hue + t * 60.0, scope.saturation, 0.8 + 0.2 * v) * scope.brightness * (1.0 + scope.treble * 0.5);
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.25, 1.0, abs(in.across));
  let a = edge * scope.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

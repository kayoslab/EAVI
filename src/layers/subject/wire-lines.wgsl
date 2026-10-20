// Wireframe edges from a segment buffer, expanded to screen-space quads.
// Bass breathes the whole object and adds a low-frequency radial ripple;
// treble shimmers line brightness; beats thicken the lines.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";
import { rotateX, rotateY, rotateZ } from "../../wgsl/lib/transform.wgsl";
import { simplex3d } from "@vgpu/wgsl-std/noise/simplex";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Wire {
  rotation: vec3f,
  scale: f32,
  resolution: vec2f,
  thickness: f32,
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
  reveal: f32,       // edges with level < reveal are shown; the front is soft
  pad1: f32,
}

struct Segment {
  a: vec4f,   // xyz + random
  b: vec4f,   // xyz + level (or random for plain wires)
}

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<uniform> wire: Wire;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
  @location(3) visible: f32,
}

fn deform(p: vec3f, seedv: f32) -> vec3f {
  let dir = normalize(p + vec3f(0.0001));
  let n = simplex3d(p * 1.7 + vec3f(wire.time * 0.15, seedv * 3.0, 0.0));
  let radial = 1.0 + wire.bass * 0.22 + n * wire.ripple * wire.bass;
  return p * radial * wire.scale;
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let s = segments[instance];
  let rot = rotateY(wire.rotation.y) * rotateX(wire.rotation.x) * rotateZ(wire.rotation.z);
  let wa = rot * deform(s.a.xyz, s.a.w);
  let wb = rot * deform(s.b.xyz, s.b.w);
  let ca = camera.viewProjection * vec4f(wa, 1.0);
  let cb = camera.viewProjection * vec4f(wb, 1.0);
  let corner = vertex % 6u;
  let thickness = wire.thickness * (1.0 + wire.beat * 0.3);

  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, thickness, wire.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let world = select(wa, wb, atB);
  let viewPos = camera.view * vec4f(world, 1.0);
  out.depth = max(-viewPos.z, 0.0);
  // Overlap compensation: segments foreshortened below the stroke width would stack into white.
  let pa = ca.xy / max(ca.w, 0.0001) * wire.resolution * 0.5;
  let pb = cb.xy / max(cb.w, 0.0001) * wire.resolution * 0.5;
  let along = length(pb - pa);
  let weight = clamp(along / (thickness * 2.5), 0.05, 1.0);
  out.visible = smoothstep(s.b.w - 0.6, s.b.w + 0.4, wire.reveal) * weight;
  let r = select(s.a.w, s.b.w, atB);
  let shimmer = 1.0 + wire.treble * 0.6 * sin(wire.time * 9.0 + r * 40.0);
  out.color = hueToRgb(wire.hue + r * 40.0, wire.saturation, 1.0) * wire.brightness * shimmer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.3, 1.0, abs(in.across));
  let fog = exp(-wire.fogDensity * in.depth);
  let a = edge * fog * in.visible * wire.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

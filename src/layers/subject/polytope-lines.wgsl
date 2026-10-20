// Regular 4-polytope edges rotated in 4-space and projected to 3D on the GPU.
// Rotations in the XW/YW/ZW planes make the object turn "through itself";
// bass pulls the projection eye closer, which swells the inner cells.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Poly {
  angles: vec4f,       // xw, yw, zw, xy
  resolution: vec2f,
  scale: f32,
  eye: f32,            // projection distance along w
  thickness: f32,
  bass: f32,
  treble: f32,
  beat: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  fogDensity: f32,
  opacity: f32,
  time: f32,
  pad0: f32,
  pad1: f32,
}

struct Segment {
  a: vec4f,
  b: vec4f,
}

@group(0) @binding(0) var<storage, read> segments: array<Segment>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<uniform> poly: Poly;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
}

fn rot2(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(vec2f(c, s), vec2f(-s, c));
}

fn rotate4(p: vec4f) -> vec4f {
  var q = p;
  let xw = rot2(poly.angles.x) * vec2f(q.x, q.w);
  q.x = xw.x; q.w = xw.y;
  let yw = rot2(poly.angles.y) * vec2f(q.y, q.w);
  q.y = yw.x; q.w = yw.y;
  let zw = rot2(poly.angles.z) * vec2f(q.z, q.w);
  q.z = zw.x; q.w = zw.y;
  let xy = rot2(poly.angles.w) * vec2f(q.x, q.y);
  q.x = xy.x; q.y = xy.y;
  return q;
}

// Perspective projection from 4D: points with larger w sit closer to the eye and grow.
fn project(p: vec4f) -> vec4f {
  let d = max(poly.eye - p.w, 0.25);
  let k = (poly.eye - 1.0) / d;
  return vec4f(p.xyz * k * poly.scale, p.w);
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let s = segments[instance];
  let pa = project(rotate4(s.a));
  let pb = project(rotate4(s.b));
  let ca = camera.viewProjection * vec4f(pa.xyz, 1.0);
  let cb = camera.viewProjection * vec4f(pb.xyz, 1.0);
  let corner = vertex % 6u;
  let thickness = poly.thickness * (1.0 + poly.beat * 0.3);

  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, thickness, poly.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let p = select(pa, pb, atB);
  let viewPos = camera.view * vec4f(p.xyz, 1.0);
  out.depth = max(-viewPos.z, 0.0);
  // The 4th coordinate colours the edge: near cells warm, far cells cool.
  let wt = p.w * 0.5 + 0.5;
  let shimmer = 1.0 + poly.treble * 0.5 * sin(poly.time * 7.0 + f32(instance) * 0.37);
  out.color = hueToRgb(poly.hue + (1.0 - wt) * 120.0, poly.saturation, 0.7 + 0.3 * wt) * poly.brightness * shimmer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.3, 1.0, abs(in.across));
  let fog = exp(-poly.fogDensity * in.depth);
  let a = edge * fog * poly.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

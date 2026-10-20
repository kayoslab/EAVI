// Streaked stars: each star is a short line along the view axis whose length
// grows with speed and bass, expanded to a screen-space quad.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Warp {
  resolution: vec2f,
  streak: f32,
  thickness: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  opacity: f32,
  fogDensity: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<storage, read> stars: array<vec4f>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<uniform> warp: Warp;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let s = stars[instance];
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let forward = -vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  // Field centred behind the camera so stars also pass beside it.
  let origin = camera.position - forward * 3.0;
  let a = origin + right * s.x + up * s.y + forward * s.z;
  let b = a + forward * warp.streak * (0.3 + s.w);
  let ca = camera.viewProjection * vec4f(a, 1.0);
  let cb = camera.viewProjection * vec4f(b, 1.0);
  let corner = vertex % 6u;
  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, warp.thickness, warp.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  out.depth = max(select(s.z, s.z + warp.streak, atB), 0.0);
  let shimmer = 1.0 + warp.treble * 0.8 * s.w;
  out.color = hueToRgb(warp.hue + s.w * 50.0, warp.saturation * 0.6, 1.0) * warp.brightness * s.w * shimmer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.2, 1.0, abs(in.across));
  let fog = exp(-warp.fogDensity * in.depth);
  let a = edge * fog * warp.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

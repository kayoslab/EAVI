// Wire cathedral: an endless lattice of tall cells around the camera, drawn as
// instanced glowing edges with a slow kaleidoscopic twist about the travel axis.
// Two scales: coarse frames and a finer, fainter sub-lattice. Pure lines.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Lattice {
  cell: vec3f,
  scroll: f32,
  resolution: vec2f,
  half: u32,          // cells per axis on each side (x and z); y uses halfY
  halfY: u32,
  thickness: f32,
  twist: f32,         // radians per unit along z
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  fogDensity: f32,
  opacity: f32,
  fineMix: f32,       // brightness of the fine sub-lattice relative to the coarse one
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> lattice: Lattice;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
  @location(3) weight: f32,
}

fn twist(p: vec3f) -> vec3f {
  let a = p.z * lattice.twist;
  let c = cos(a);
  let s = sin(a);
  return vec3f(p.x * c - p.y * s, p.x * s + p.y * c, p.z);
}

fn screenPx(world: vec3f) -> vec2f {
  let c = camera.viewProjection * vec4f(world, 1.0);
  return c.xy / max(c.w, 0.0001) * lattice.resolution * 0.5;
}

// Instance layout: [scale: 0 coarse / 1 fine][axis: 0 x, 1 y, 2 z][cell index]
@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let nx = lattice.half * 2u + 1u;
  let ny = lattice.halfY * 2u + 1u;
  let nz = nx;
  let perAxis = nx * ny * nz;
  let scaleIdx = instance / (perAxis * 3u);
  let rem = instance % (perAxis * 3u);
  let axis = rem / perAxis;
  let ci = rem % perAxis;
  let ix = ci % nx;
  let iy = (ci / nx) % ny;
  let iz = ci / (nx * ny);

  let fine = f32(scaleIdx);
  let cell = lattice.cell / (1.0 + fine);
  // The lattice is anchored to the camera so it is endless; scroll moves it along z and wraps per cell.
  let wrap = lattice.scroll - cell.z * floor(lattice.scroll / cell.z);
  let base = vec3f(
    (f32(ix) - f32(lattice.half)) * cell.x,
    (f32(iy) - f32(lattice.halfY)) * cell.y,
    (f32(iz) - f32(lattice.half)) * cell.z - wrap,
  );
  var a = base;
  var b = base;
  if (axis == 0u) { b.x += cell.x; }
  else if (axis == 1u) { b.y += cell.y; }
  else { b.z += cell.z; }
  // Fine lines only in the middle of coarse cells' faces would be more "architectural";
  // offset the fine lattice by half a coarse cell so it reads as inner scaffolding.
  if (scaleIdx == 1u) {
    a += cell * 0.5;
    b += cell * 0.5;
  }
  let wa = twist(a);
  let wb = twist(b);
  let ca = camera.viewProjection * vec4f(wa, 1.0);
  let cb = camera.viewProjection * vec4f(wb, 1.0);
  let corner = vertex % 6u;
  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, lattice.thickness, lattice.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let world = select(wa, wb, atB);
  let viewPos = camera.view * vec4f(world, 1.0);
  out.depth = max(-viewPos.z, 0.0);
  // Overlap compensation: foreshortened edges stack additively, so weight by on-screen length.
  let along = length(screenPx(wb) - screenPx(wa));
  out.weight = clamp(along / (lattice.thickness * 2.5), 0.05, 1.0) * mix(1.0, lattice.fineMix, fine);
  let tone = select(0.0, 40.0, axis == 1u);
  let shimmer = 1.0 + lattice.treble * 0.5 * fine;
  out.color = hueToRgb(lattice.hue + tone + fine * 120.0, lattice.saturation, 1.0) * lattice.brightness * shimmer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.3, 1.0, abs(in.across));
  let fog = exp(-lattice.fogDensity * in.depth);
  let a = edge * fog * in.weight * lattice.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

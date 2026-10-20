// Infinite wireframe grid: floor and ceiling planes of glowing lines receding to
// the vanishing point. Lines are generated procedurally per instance; no buffers.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Grid {
  resolution: vec2f,
  cell: f32,
  halfLines: f32,      // lines per direction per plane on each side of the origin
  extent: f32,         // half-length of each line
  height: f32,         // floor at -height, ceiling at +height
  scroll: f32,         // world-unit offset along -Z (wraps per cell)
  thickness: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  fogDensity: f32,
  opacity: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> grid: Grid;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
}

// Instance layout: [plane: 0 floor / 1 ceiling][axis: 0 along X / 1 along Z][index]
@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let linesPerAxis = u32(grid.halfLines) * 2u + 1u;
  let perPlane = linesPerAxis * 2u;
  let plane = instance / perPlane;
  let rem = instance % perPlane;
  let axis = rem / linesPerAxis;
  let index = f32(rem % linesPerAxis) - grid.halfLines;

  let y = select(-grid.height, grid.height, plane == 1u);
  var a: vec3f;
  var b: vec3f;
  if (axis == 0u) {
    // Lines along X at fixed z; these scroll toward the camera and wrap.
    let z = index * grid.cell - (grid.scroll - grid.cell * floor(grid.scroll / grid.cell));
    a = vec3f(-grid.extent, y, z);
    b = vec3f(grid.extent, y, z);
  } else {
    let x = index * grid.cell;
    a = vec3f(x, y, -grid.extent);
    b = vec3f(x, y, grid.extent);
  }

  let ca = camera.viewProjection * vec4f(a, 1.0);
  let cb = camera.viewProjection * vec4f(b, 1.0);
  let corner = vertex % 6u;
  let thickness = grid.thickness * (1.0 + grid.treble * 0.5);

  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, thickness, grid.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let world = select(a, b, atB);
  let viewPos = camera.view * vec4f(world, 1.0);
  out.depth = max(-viewPos.z, 0.0);
  // Two-tone: floor in the palette hue, ceiling shifted; far lines cool off.
  let hue = grid.hue + select(0.0, 150.0, plane == 1u);
  out.color = hueToRgb(hue, grid.saturation, 1.0) * grid.brightness;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.35, 1.0, abs(in.across));
  let fog = exp(-grid.fogDensity * in.depth);
  let a = edge * fog * grid.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

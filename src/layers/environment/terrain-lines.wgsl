// Terrain grid lines: X-direction and Z-direction segments between neighbouring heightfield vertices.

import { lineQuadVertex, lineQuadAcross } from "../../wgsl/lib/lines.wgsl";
import { terrainHeight, terrainColor, terrainCoord, terrainEdgeFade } from "./terrain-common.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Terrain {
  resolution: vec2f,
  rows: u32,
  cols: u32,
  extent: f32,
  scroll: f32,
  heightScale: f32,
  noiseScale: f32,
  thickness: f32,
  pointSize: f32,
  hue: f32,
  hueMix: f32,
  bass: f32,
  treble: f32,
  fogDensity: f32,
  opacity: f32,
  yOffset: f32,
  brightness: f32,
  time: f32,
  pad0: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> terrain: Terrain;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) across: f32,
  @location(1) color: vec3f,
  @location(2) depth: f32,
  @location(3) edge: f32,
  @location(4) density: f32,
}

fn screenPx(world: vec3f) -> vec2f {
  let c = camera.viewProjection * vec4f(world, 1.0);
  return c.xy / max(c.w, 0.0001) * terrain.resolution * 0.5;
}

// Overlap compensation: neighbouring lines closer than the stroke width, or segments
// foreshortened to less than it, would stack additively into white. Scale alpha so the
// summed brightness stays level however the grid converges on screen.
fn densityWeight(a: vec3f, b: vec3f, neighbour: vec3f) -> f32 {
  let pa = screenPx(a);
  let along = length(screenPx(b) - pa);
  let across = length(screenPx(neighbour) - pa);
  let w = terrain.thickness * 1.6;
  return clamp(along / w, 0.05, 1.0) * clamp(across / w, 0.05, 1.0);
}

fn vertexAt(i: u32, j: u32) -> vec3f {
  let x = terrainCoord(i, terrain.cols, terrain.extent);
  let z = terrainCoord(j, terrain.rows, terrain.extent);
  let y = terrainHeight(x, z, terrain.scroll, terrain.noiseScale, terrain.heightScale, terrain.bass);
  return vec3f(x, y + terrain.yOffset, z);
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  let xSegments = terrain.rows * (terrain.cols - 1u);
  var a: vec3f;
  var b: vec3f;
  var neighbour: vec3f;
  if (instance < xSegments) {
    let j = instance / (terrain.cols - 1u);
    let i = instance % (terrain.cols - 1u);
    a = vertexAt(i, j);
    b = vertexAt(i + 1u, j);
    neighbour = vertexAt(i, select(j + 1u, j - 1u, j + 1u >= terrain.rows));
  } else {
    let k = instance - xSegments;
    let i = k / (terrain.rows - 1u);
    let j = k % (terrain.rows - 1u);
    a = vertexAt(i, j);
    b = vertexAt(i, j + 1u);
    neighbour = vertexAt(select(i + 1u, i - 1u, i + 1u >= terrain.cols), j);
  }
  let density = densityWeight(a, b, neighbour);
  let ca = camera.viewProjection * vec4f(a, 1.0);
  let cb = camera.viewProjection * vec4f(b, 1.0);
  let corner = vertex % 6u;
  var out: VertexOut;
  out.position = lineQuadVertex(ca, cb, corner, terrain.thickness, terrain.resolution);
  out.across = lineQuadAcross(corner);
  let atB = corner == 1u || corner == 4u || corner == 5u;
  let world = select(a, b, atB);
  let viewPos = camera.view * vec4f(world, 1.0);
  out.depth = max(-viewPos.z, 0.0);
  out.edge = terrainEdgeFade(world.x, world.z, terrain.extent);
  out.density = density;
  let t = (world.y - terrain.yOffset) / max(terrain.heightScale, 0.001) * 0.5 + 0.5;
  out.color = terrainColor(t, terrain.hue, terrain.hueMix) * terrain.brightness;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let edge = 1.0 - smoothstep(0.3, 1.0, abs(in.across));
  let fog = exp(-terrain.fogDensity * in.depth);
  let a = edge * fog * in.edge * in.density * terrain.opacity;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(in.color * a, a);
}

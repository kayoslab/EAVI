// Terrain vertex dots: a glowing point at every heightfield vertex, brighter on the peaks.

import { terrainHeight, terrainColor } from "./terrain-common.wgsl";

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
  cell: f32,
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
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = quad[vertex % 6u];
  let i = instance % terrain.cols;
  let j = instance / terrain.cols;
  let x = (f32(i) - f32(terrain.cols) * 0.5) * terrain.cell;
  let z = (f32(j) - f32(terrain.rows) * 0.5) * terrain.cell;
  let y = terrainHeight(x, z, terrain.scroll, terrain.noiseScale, terrain.heightScale, terrain.bass);
  let world = vec3f(x, y + terrain.yOffset, z);
  let clip = camera.viewProjection * vec4f(world, 1.0);
  var out: VertexOut;
  out.local = corner;
  if (clip.w <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    return out;
  }
  let t = y / max(terrain.heightScale, 0.001) * 0.5 + 0.5;
  // Peaks get larger, brighter dots; treble makes them twinkle.
  let twinkle = 1.0 + terrain.treble * 0.5 * sin(terrain.time * 5.0 + f32(instance) * 0.73);
  let sizePx = terrain.pointSize * (0.7 + t * 0.8) * twinkle;
  out.position = vec4f(clip.xy + corner * sizePx / terrain.resolution * clip.w, clip.zw);
  let viewPos = camera.view * vec4f(world, 1.0);
  let fog = exp(-terrain.fogDensity * max(-viewPos.z, 0.0));
  out.color = terrainColor(t, terrain.hue, terrain.hueMix) * terrain.brightness * (0.6 + t * 0.8);
  out.alpha = fog * terrain.opacity;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let d = length(in.local);
  let disc = 1.0 - smoothstep(0.2, 1.0, d);
  if (disc <= 0.001) {
    discard;
  }
  let a = disc * in.alpha;
  return vec4f(in.color * a, a);
}

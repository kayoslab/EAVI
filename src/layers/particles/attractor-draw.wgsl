// Expands each particle into a screen-aligned additive quad. Reads the
// simulation buffer directly in the vertex stage (needs maxStorageBuffersInVertexStage >= 1).

import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct View {
  center: vec3f,
  worldScale: f32,
  resolution: vec2f,
  pointSize: f32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  treble: f32,
  opacity: f32,
}

@group(0) @binding(0) var<storage, read> particles: array<vec4f>;
@group(0) @binding(1) var<uniform> camera: Camera;
@group(0) @binding(2) var<uniform> view: View;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) color: vec3f,
  @location(2) alpha: f32,
}

@vertex fn vs_main(
  @builtin(vertex_index) vertex: u32,
  @builtin(instance_index) instance: u32,
) -> VertexOut {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = quad[vertex];
  let p = particles[instance];
  var out: VertexOut;
  out.local = corner;

  let world = (p.xyz - view.center) * view.worldScale;
  let clip = camera.viewProjection * vec4f(world, 1.0);
  if (clip.w <= 0.0 || p.w <= 0.0) {
    out.position = vec4f(2.0, 2.0, 0.0, 1.0);
    return out;
  }

  // Treble sparkle: brighter points also get slightly larger.
  let sizePx = view.pointSize * (1.0 + view.treble * 0.6);
  let offset = corner * sizePx / view.resolution * clip.w;
  out.position = vec4f(clip.xy + offset, clip.zw);

  // Hue drifts along the attractor's vertical axis: the two lobes read as two tones.
  let t = clamp(p.z / 50.0, 0.0, 1.0);
  let lobe = select(0.0, 0.08, p.x > 0.0);
  out.color = hueToRgb(view.hue + (t * 0.22 + lobe) * 360.0, view.saturation, 1.0) * view.brightness;
  out.alpha = smoothstep(0.0, 0.35, p.w) * view.opacity;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let d = length(in.local);
  let disc = 1.0 - smoothstep(0.15, 1.0, d);
  if (disc <= 0.001) {
    discard;
  }
  let a = disc * in.alpha;
  // Premultiplied for the one/one additive blend.
  return vec4f(in.color * a, a);
}

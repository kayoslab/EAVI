// Billboard quads showing the flame texture, stacked at two depths for parallax.

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Sheet {
  size: vec2f,
  depthStep: f32,
  opacity: f32,
  bass: f32,
  beat: f32,
  pad0: f32,
  pad1: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> sheet: Sheet;
@group(0) @binding(2) var flame: texture_2d<f32>;
@group(0) @binding(3) var samp: sampler;

struct VertexOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) layer: f32,
}

@vertex fn vs_main(@builtin(vertex_index) vertex: u32, @builtin(instance_index) instance: u32) -> VertexOut {
  var quad = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0),
    vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
  );
  let corner = quad[vertex % 6u];
  // Camera-facing basis from the view matrix rows.
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let back = vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  let layer = f32(instance);
  let scale = 1.0 + layer * 0.35 + sheet.bass * 0.08 + sheet.beat * 0.03;
  let center = back * (-sheet.depthStep * layer);
  let world = center + right * corner.x * sheet.size.x * scale + up * corner.y * sheet.size.y * scale;
  var out: VertexOut;
  out.position = camera.viewProjection * vec4f(world, 1.0);
  out.uv = vec2f(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  out.layer = layer;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let t = textureSampleLevel(flame, samp, in.uv, 0.0);
  let fade = select(0.8, 0.3, in.layer > 0.5);
  // The sheet has no visible border: density fades out toward the quad's edges.
  let edge = smoothstep(0.0, 0.3, min(in.uv.x, 1.0 - in.uv.x)) * smoothstep(0.0, 0.3, min(in.uv.y, 1.0 - in.uv.y));
  let a = t.a * sheet.opacity * fade * edge;
  if (a <= 0.002) {
    discard;
  }
  return vec4f(t.rgb * sheet.opacity * fade * edge, a);
}

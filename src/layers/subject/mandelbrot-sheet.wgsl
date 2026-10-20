// Terraced contour sheets: N camera-facing quads stacked in depth, each showing the
// escape counts of one residue class mod N as a glowing band. Together they turn the
// 2D escape-time field into a 3D terrace with real parallax; the zoom flows bands outward.

import { hueToRgb } from "../../wgsl/lib/color.wgsl";

struct Camera {
  view: mat4x4f,
  projection: mat4x4f,
  viewProjection: mat4x4f,
  position: vec3f,
  time: f32,
}

struct Sheet {
  resolution: vec2f,
  halfSize: f32,       // overscan factor on the view-filling extent (1 = exactly the frame)
  depthSpan: f32,      // total depth of the stack along the view axis
  sheets: u32,
  width: u32,
  height: u32,
  pad0: u32,
  hue: f32,
  saturation: f32,
  brightness: f32,
  bass: f32,
  opacity: f32,
  bandWidth: f32,      // iterations covered by one sheet's band
  pad1: f32,
  pad2: f32,
}

@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> sheet: Sheet;
@group(0) @binding(2) var field: texture_2d<f32>;

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
  let right = vec3f(camera.view[0][0], camera.view[1][0], camera.view[2][0]);
  let up = vec3f(camera.view[0][1], camera.view[1][1], camera.view[2][1]);
  let back = vec3f(camera.view[0][2], camera.view[1][2], camera.view[2][2]);
  let n = f32(sheet.sheets);
  let k = f32(instance);
  // Sheet depth along the view axis, centred on the origin; nearer sheets are smaller so
  // every sheet subtends the same angle from the camera's resting distance.
  let z = (k / max(n - 1.0, 1.0) - 0.5) * sheet.depthSpan;
  let camDist = max(length(camera.position), 0.5);
  let scale = (camDist + z) / camDist;
  let center = back * z;
  let aspect = sheet.resolution.x / max(sheet.resolution.y, 1.0);
  // Fill the view: the frame's half-height at the origin plane is camDist · tan(fov/2) = camDist / P[1][1].
  let halfH = camDist / max(camera.projection[1][1], 0.01) * sheet.halfSize;
  let world = center + right * corner.x * halfH * aspect * scale + up * corner.y * halfH * scale;
  var out: VertexOut;
  out.position = camera.viewProjection * vec4f(world, 1.0);
  out.uv = vec2f(corner.x * 0.5 + 0.5, 0.5 - corner.y * 0.5);
  out.layer = k;
  return out;
}

@fragment fn fs_main(in: VertexOut) -> @location(0) vec4f {
  let texel = vec2i(vec2f(in.uv) * vec2f(f32(sheet.width), f32(sheet.height)));
  let iter = textureLoad(field, texel, 0).x;
  if (iter < 1.5) {
    discard; // inside the set, or the near-infinity zone where every count is the same
  }
  let n = f32(sheet.sheets);
  // Contour lines: this sheet draws the integer crossings of its residue class, as thin
  // glowing lines (never filled bands, which would slab over slowly varying regions).
  let level = iter / sheet.bandWidth - in.layer;
  let r = fract(level / n + 0.5) - 0.5;              // distance to the nearest own crossing, in units of n
  let lineHalf = 0.22 / n;                            // ±0.22 iterations
  // Where counts change faster than a pixel, widen the line to a pixel so it stays continuous.
  let aa = max(lineHalf, fwidth(r) * 0.8);
  var band = 1.0 - smoothstep(0.0, aa, abs(r));
  // Overlap compensation: where more than one of this sheet's crossings lands on a pixel, the
  // lines would stack additively into white; scale by how many crossings the pixel spans.
  let crossingsPerPixel = fwidth(level) / n;
  band /= max(1.0, crossingsPerPixel * 2.0);
  if (band <= 0.003) {
    discard;
  }
  // Soft quad edge; hue cycles with the sheet so the terraces read as a spectrum.
  let edge = smoothstep(0.0, 0.12, min(in.uv.x, 1.0 - in.uv.x)) * smoothstep(0.0, 0.12, min(in.uv.y, 1.0 - in.uv.y));
  let hue = sheet.hue + in.layer / n * 300.0;
  let color = hueToRgb(hue, sheet.saturation, 1.0) * sheet.brightness * (0.8 + sheet.bass * 0.4);
  let a = band * edge * sheet.opacity;
  return vec4f(color * a, a);
}

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
  density: f32,        // contour levels per octave of distance
  logHalf: f32,        // log2 of the current view half-height, so levels are scale-invariant
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
  // Bilinear sample of the field (r32float is not filterable, so blend four texels by hand);
  // a texel inside the set poisons the sample, which keeps the silhouette crisp.
  let size = vec2f(f32(sheet.width), f32(sheet.height));
  let p = in.uv * size - 0.5;
  let p0 = floor(p);
  let f = p - p0;
  let i0 = vec2i(clamp(p0, vec2f(0.0), size - 1.0));
  let i1 = vec2i(clamp(p0 + 1.0, vec2f(0.0), size - 1.0));
  let v00 = textureLoad(field, vec2i(i0.x, i0.y), 0).x;
  let v10 = textureLoad(field, vec2i(i1.x, i0.y), 0).x;
  let v01 = textureLoad(field, vec2i(i0.x, i1.y), 0).x;
  let v11 = textureLoad(field, vec2i(i1.x, i1.y), 0).x;
  if (min(min(v00, v10), min(v01, v11)) < -1.0e5) {
    discard; // inside the set
  }
  let logDist = mix(mix(v00, v10, f.x), mix(v01, v11, f.x), f.y);
  let n = f32(sheet.sheets);
  // Equidistant contours around the set, measured in octaves of distance relative to the
  // view size, so the line density looks the same at every magnification. This sheet draws
  // the crossings of its residue class as thin lines.
  let level = (sheet.logHalf - logDist) * sheet.density - in.layer;
  if (level < 0.0) {
    discard; // farther from the set than the view is wide: open space
  }
  let r = fract(level / n + 0.5) - 0.5;
  let lineHalf = 0.2 / n;
  let aa = max(lineHalf, fwidth(r) * 0.9);
  var band = 1.0 - smoothstep(0.0, aa, abs(r));
  // Where contours crowd denser than pixels (right at the boundary) they cannot be drawn as
  // curves; fade them out rather than leaving speckle.
  let crossingsPerPixel = fwidth(level) / n;
  band *= 1.0 - smoothstep(0.12, 0.45, crossingsPerPixel);
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

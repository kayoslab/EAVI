// Mandelbrot distance-estimate field into an r32float texture: log2 of the estimated
// distance to the set (smooth everywhere outside it), or a large negative sentinel inside.
// Contours of this field are clean nested curves that hug the boundary; escape counts
// would be chaotic texel to texel near it and flicker as the zoom moves.

struct Params {
  center: vec2f,
  halfSize: vec2f,
  maxIter: u32,
  width: u32,
  height: u32,
  pad0: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var outTex: texture_storage_2d<r32float, write>;

const INSIDE: f32 = -1.0e6;

@compute @workgroup_size(16, 16) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  if (gid.x >= params.width || gid.y >= params.height) {
    return;
  }
  let uv = (vec2f(f32(gid.x), f32(gid.y)) + 0.5) / vec2f(f32(params.width), f32(params.height));
  let c = params.center + (uv * 2.0 - 1.0) * params.halfSize;

  // Interior shortcuts: main cardioid and period-2 bulb never escape.
  let q = (c.x - 0.25) * (c.x - 0.25) + c.y * c.y;
  var value = INSIDE;
  if (q * (q + (c.x - 0.25)) > 0.25 * c.y * c.y && (c.x + 1.0) * (c.x + 1.0) + c.y * c.y > 0.0625) {
    var z = vec2f(0.0);
    var dz = vec2f(0.0);   // d z / d c
    var i = 0u;
    var m2 = 0.0;
    loop {
      if (i >= params.maxIter) { break; }
      dz = 2.0 * vec2f(z.x * dz.x - z.y * dz.y, z.x * dz.y + z.y * dz.x) + vec2f(1.0, 0.0);
      z = vec2f(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
      m2 = dot(z, z);
      if (m2 > 1.0e8) { break; }
      i++;
    }
    if (i < params.maxIter) {
      let m = sqrt(m2);
      let d = m * log(m) / max(length(dz), 1.0e-20);
      value = log2(max(d, 1.0e-30));
    }
  }
  textureStore(outTex, vec2i(gid.xy), vec4f(value, 0.0, 0.0, 1.0));
}

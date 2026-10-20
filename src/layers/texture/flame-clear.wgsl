// Zero the flame histogram each frame.

struct Params {
  texels: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var<storage, read_write> hist: array<atomic<u32>>;

@compute @workgroup_size(256) fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i > params.texels * 4u) {
    return;
  }
  atomicStore(&hist[i], 0u);
}

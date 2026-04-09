/**
 * US-082: Pre-computed 3D curl-noise lookup table for CPU-side advection.
 *
 * Builds a 3D grid of curl vectors from simplex noise at init time,
 * then provides fast trilinear interpolation at runtime.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// --------------------------------------------------------------------------
// 3D Simplex noise (Stefan Gustavson, optimised scalar TypeScript port)
// --------------------------------------------------------------------------

// Gradient table for 3D simplex noise (12 edges of a cube)
const GRAD3: ReadonlyArray<readonly [number, number, number]> = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
];

// Permutation table (doubled for wrapping)
const PERM = new Uint8Array(512);
const BASE_PERM = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148,
  247, 120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32,
  57, 177, 33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175,
  74, 165, 71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122,
  60, 211, 133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54,
  65, 25, 63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169,
  200, 196, 135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64,
  52, 217, 226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212,
  207, 206, 59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213,
  119, 248, 152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9,
  129, 22, 39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104,
  218, 246, 97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241,
  81, 51, 145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157,
  184, 84, 204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93,
  222, 114, 67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];
for (let i = 0; i < 256; i++) {
  PERM[i] = BASE_PERM[i];
  PERM[i + 256] = BASE_PERM[i];
}

const F3 = 1.0 / 3.0;
const G3 = 1.0 / 6.0;

function dot3(g: readonly [number, number, number], x: number, y: number, z: number): number {
  return g[0] * x + g[1] * y + g[2] * z;
}

/** 3D simplex noise, returns value in roughly [-1, 1]. */
function snoise3(xin: number, yin: number, zin: number): number {
  const s = (xin + yin + zin) * F3;
  const i = Math.floor(xin + s);
  const j = Math.floor(yin + s);
  const k = Math.floor(zin + s);
  const t = (i + j + k) * G3;

  const X0 = i - t;
  const Y0 = j - t;
  const Z0 = k - t;
  const x0 = xin - X0;
  const y0 = yin - Y0;
  const z0 = zin - Z0;

  // Determine simplex
  let i1: number, j1: number, k1: number;
  let i2: number, j2: number, k2: number;
  if (x0 >= y0) {
    if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
    else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
  } else {
    if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
    else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
    else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
  }

  const x1 = x0 - i1 + G3;
  const y1 = y0 - j1 + G3;
  const z1 = z0 - k1 + G3;
  const x2 = x0 - i2 + 2.0 * G3;
  const y2 = y0 - j2 + 2.0 * G3;
  const z2 = z0 - k2 + 2.0 * G3;
  const x3 = x0 - 1.0 + 3.0 * G3;
  const y3 = y0 - 1.0 + 3.0 * G3;
  const z3 = z0 - 1.0 + 3.0 * G3;

  const ii = i & 255;
  const jj = j & 255;
  const kk = k & 255;
  const gi0 = PERM[ii + PERM[jj + PERM[kk]]] % 12;
  const gi1 = PERM[ii + i1 + PERM[jj + j1 + PERM[kk + k1]]] % 12;
  const gi2 = PERM[ii + i2 + PERM[jj + j2 + PERM[kk + k2]]] % 12;
  const gi3 = PERM[ii + 1 + PERM[jj + 1 + PERM[kk + 1]]] % 12;

  let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

  let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
  if (t0 > 0) { t0 *= t0; n0 = t0 * t0 * dot3(GRAD3[gi0], x0, y0, z0); }

  let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
  if (t1 > 0) { t1 *= t1; n1 = t1 * t1 * dot3(GRAD3[gi1], x1, y1, z1); }

  let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
  if (t2 > 0) { t2 *= t2; n2 = t2 * t2 * dot3(GRAD3[gi2], x2, y2, z2); }

  let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
  if (t3 > 0) { t3 *= t3; n3 = t3 * t3 * dot3(GRAD3[gi3], x3, y3, z3); }

  return 32.0 * (n0 + n1 + n2 + n3);
}

/** FBM with 3D simplex noise. */
function fbm3(px: number, py: number, pz: number, octaves: number): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let total = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * snoise3(px * frequency, py * frequency, pz * frequency);
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.0;
  }
  return value / total;
}

/** Curl of FBM noise field — divergence-free by construction. */
function curlAtPoint(px: number, py: number, pz: number, octaves: number): Vec3 {
  const e = 0.01;
  const n = fbm3(px, py, pz, octaves);
  const nx = fbm3(px + e, py, pz, octaves);
  const ny = fbm3(px, py + e, pz, octaves);
  const nz = fbm3(px, py, pz + e, octaves);
  const dnx = (nx - n) / e;
  const dny = (ny - n) / e;
  const dnz = (nz - n) / e;
  return { x: dny - dnz, y: dnz - dnx, z: dnx - dny };
}

// --------------------------------------------------------------------------
// Curl LUT
// --------------------------------------------------------------------------

export interface CurlLUT {
  resolution: number;
  bounds: { min: Vec3; max: Vec3 };
  data: Float32Array;
}

/**
 * Build a pre-computed 3D grid of curl-noise vectors.
 * @param seed Numeric seed (shifts the noise domain for determinism)
 * @param resolution Grid resolution per axis (default 32 → 32³ cells)
 */
export function buildCurlLUT(seed: number, resolution = 32): CurlLUT {
  const res = resolution;
  const bounds = {
    min: { x: -4, y: -4, z: -4 },
    max: { x: 4, y: 4, z: 4 },
  };
  const data = new Float32Array(res * res * res * 3);

  // Seed offset shifts noise domain so different seeds → different fields
  const seedOffset = seed * 7.531;
  const octaves = 3;

  const sx = (bounds.max.x - bounds.min.x) / (res - 1);
  const sy = (bounds.max.y - bounds.min.y) / (res - 1);
  const sz = (bounds.max.z - bounds.min.z) / (res - 1);

  let idx = 0;
  for (let iz = 0; iz < res; iz++) {
    const wz = bounds.min.z + iz * sz;
    for (let iy = 0; iy < res; iy++) {
      const wy = bounds.min.y + iy * sy;
      for (let ix = 0; ix < res; ix++) {
        const wx = bounds.min.x + ix * sx;
        // Sample curl at this grid point (noise space scaled by 0.4 to match GLSL)
        const c = curlAtPoint(
          wx * 0.4 + seedOffset,
          wy * 0.4 + seedOffset * 0.7,
          wz * 0.4 + seedOffset * 0.3,
          octaves,
        );
        data[idx++] = c.x;
        data[idx++] = c.y;
        data[idx++] = c.z;
      }
    }
  }

  return { resolution: res, bounds, data };
}

/**
 * Trilinear interpolation of curl vector at arbitrary world-space position.
 * Clamps to boundary for out-of-bounds queries.
 */
export function sampleCurl(lut: CurlLUT, x: number, y: number, z: number): Vec3 {
  const { resolution: res, bounds, data } = lut;
  const { min, max } = bounds;

  // Normalise to [0, res-1] grid coords
  const invX = (res - 1) / (max.x - min.x);
  const invY = (res - 1) / (max.y - min.y);
  const invZ = (res - 1) / (max.z - min.z);

  let gx = (x - min.x) * invX;
  let gy = (y - min.y) * invY;
  let gz = (z - min.z) * invZ;

  // Clamp to valid range
  gx = Math.max(0, Math.min(res - 1.001, gx));
  gy = Math.max(0, Math.min(res - 1.001, gy));
  gz = Math.max(0, Math.min(res - 1.001, gz));

  const ix = Math.floor(gx);
  const iy = Math.floor(gy);
  const iz = Math.floor(gz);

  const fx = gx - ix;
  const fy = gy - iy;
  const fz = gz - iz;

  // 8 corner indices
  const ix1 = Math.min(ix + 1, res - 1);
  const iy1 = Math.min(iy + 1, res - 1);
  const iz1 = Math.min(iz + 1, res - 1);

  const stride = 3;
  const rowStride = res * stride;
  const sliceStride = res * rowStride;

  function at(ci: number, cj: number, ck: number): number {
    return ck * sliceStride + cj * rowStride + ci * stride;
  }

  const i000 = at(ix, iy, iz);
  const i100 = at(ix1, iy, iz);
  const i010 = at(ix, iy1, iz);
  const i110 = at(ix1, iy1, iz);
  const i001 = at(ix, iy, iz1);
  const i101 = at(ix1, iy, iz1);
  const i011 = at(ix, iy1, iz1);
  const i111 = at(ix1, iy1, iz1);

  // Trilinear interpolation for each component
  const ofx = 1 - fx;
  const ofy = 1 - fy;
  const ofz = 1 - fz;

  const rx =
    ofz * (ofy * (ofx * data[i000] + fx * data[i100]) + fy * (ofx * data[i010] + fx * data[i110])) +
    fz * (ofy * (ofx * data[i001] + fx * data[i101]) + fy * (ofx * data[i011] + fx * data[i111]));

  const ry =
    ofz * (ofy * (ofx * data[i000 + 1] + fx * data[i100 + 1]) + fy * (ofx * data[i010 + 1] + fx * data[i110 + 1])) +
    fz * (ofy * (ofx * data[i001 + 1] + fx * data[i101 + 1]) + fy * (ofx * data[i011 + 1] + fx * data[i111 + 1]));

  const rz =
    ofz * (ofy * (ofx * data[i000 + 2] + fx * data[i100 + 2]) + fy * (ofx * data[i010 + 2] + fx * data[i110 + 2])) +
    fz * (ofy * (ofx * data[i001 + 2] + fx * data[i101 + 2]) + fy * (ofx * data[i011 + 2] + fx * data[i111 + 2]));

  return { x: rx, y: ry, z: rz };
}

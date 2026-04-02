// Audio-driven 3D warp vertex shader for point cloud
// US-032: GPU-side deformation driven by bass/treble energy uniforms

uniform float uTime;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uMotionAmplitude;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uCadence;
uniform float uBreathScale;
uniform float uBasePointSize;

attribute float aHueOffset;
attribute vec3 aRandom;

varying vec3 vColor;

const float TAU = 6.283185307;

// Layered sine noise — 3 octaves with prime frequencies
// Produces non-repeating organic motion without texture lookups
float layeredNoise(float x, float y, float z) {
  float n = sin(x * 7.3 + y * 13.7 + z * 23.1);
  n += 0.5 * sin(x * 17.1 + y * 31.3 + z * 11.9);
  n += 0.25 * sin(x * 43.7 + y * 7.9 + z * 53.3);
  return n / 1.75;
}

// HSL to RGB conversion
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h * 6.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Bass macro deformation ---
  // Radial expansion
  float expansion = 1.0 + uBassEnergy * 0.25 * ma;
  pos *= expansion;

  // Twist around Y axis (differential per-point)
  float twistAngle = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.3 * ma;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // Bass directional drift
  float bassDrift = uBassEnergy * 0.25 * ma;
  pos.x += sin(t * 0.0004 + aRandom.x * 11.0) * bassDrift;
  pos.y += cos(t * 0.0003 + aRandom.y * 13.0) * bassDrift;
  pos.z += sin(t * 0.0005 + aRandom.z * 7.0) * bassDrift;

  // --- Treble micro displacement ---
  float trebleJitter = uTrebleEnergy * 0.12 * ma;
  pos.x += sin(t * 0.011 + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.013 + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.009 + aRandom.z * 3.1) * trebleJitter;

  // --- Time evolution (slow modulation, period 30-60s) ---
  float slowMod = sin(t * 0.00015 + aRandom.x * TAU) * 0.08 * ma;
  float slowMod2 = cos(t * 0.0001 + aRandom.y * TAU) * 0.06 * ma;
  pos.x += slowMod * layeredNoise(pos.x, pos.y, t * 0.0001);
  pos.y += slowMod2 * layeredNoise(pos.y, pos.z, t * 0.00012);
  pos.z += slowMod * layeredNoise(pos.z, pos.x, t * 0.00008);

  // --- Pointer repulsion (screen-space approximation) ---
  if (uPointerDisturbance > 0.0) {
    vec2 screenApprox = vec2(pos.x / 3.0, pos.y / 3.0);
    vec2 diff = screenApprox - uPointerPos;
    float dist = length(diff) + 0.01;
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.5;
    pos.x += diff.x * influence;
    pos.y += diff.y * influence;
  }

  // --- Apply breathing scale ---
  pos *= uBreathScale;

  // --- Point size ---
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = size * uBasePointSize * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;

  // --- Color computation ---
  float hue = mod(uPaletteHue + aHueOffset, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;
  float lightness = 0.6;
  // Treble-modulated sparkle
  if (uTrebleEnergy > 0.5) {
    lightness += sin(t * 0.02 + aRandom.x * 1.3) * 0.15 * uTrebleEnergy;
  }
  vColor = hsl2rgb(hue, uPaletteSaturation, lightness);
}

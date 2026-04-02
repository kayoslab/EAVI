// Audio-driven 3D ribbon warp vertex shader
// US-034: GPU-side deformation for ribbon-of-points mode

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
uniform float uNoiseFrequency;
uniform float uRadialScale;
uniform float uTwistStrength;
uniform float uFieldSpread;
uniform int uNoiseOctaves;
uniform float uEnablePointerRepulsion;
uniform float uEnableSlowModulation;

attribute float aHueOffset;
attribute vec3 aRandom;

varying vec3 vColor;

const float TAU = 6.283185307;

// Layered sine noise — octave count controlled by uNoiseOctaves uniform
float layeredNoise(float x, float y, float z) {
  float n = sin(x * 7.3 + y * 13.7 + z * 23.1);
  if (uNoiseOctaves >= 2) {
    n += 0.5 * sin(x * 17.1 + y * 31.3 + z * 11.9);
  }
  if (uNoiseOctaves >= 3) {
    n += 0.25 * sin(x * 43.7 + y * 7.9 + z * 53.3);
  }
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

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Bass macro deformation: ribbon-wide undulation ---
  // Radial expansion driven by bass
  float expansion = 1.0 + uBassEnergy * 0.3 * ma;
  pos *= expansion;

  // Sinusoidal ribbon sway — large-scale wave along the ribbon length
  float ribbonPhase = pos.x * 0.8 + pos.z * 0.5 + t * 0.0004;
  float bassSway = uBassEnergy * sin(ribbonPhase + aRandom.x * TAU) * 0.4 * ma;
  pos.y += bassSway;
  pos.x += cos(ribbonPhase * 0.7 + aRandom.y * TAU) * uBassEnergy * 0.2 * ma;

  // Twist around Y axis, scaled by structural twist
  float twistAngle = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.35 * ma * uTwistStrength;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // --- Treble micro displacement: per-point jitter and sparkle ---
  float trebleJitter = uTrebleEnergy * 0.15 * ma;
  pos.x += sin(t * 0.013 + aRandom.x * 9.1) * trebleJitter;
  pos.y += cos(t * 0.015 + aRandom.y * 7.3) * trebleJitter;
  pos.z += sin(t * 0.011 + aRandom.z * 5.7) * trebleJitter;

  // --- Time evolution (slow modulation) ---
  if (uEnableSlowModulation > 0.5) {
    float slowMod = sin(t * 0.00015 + aRandom.x * TAU) * 0.08 * ma;
    float slowMod2 = cos(t * 0.0001 + aRandom.y * TAU) * 0.06 * ma;
    pos.x += slowMod * layeredNoise(pos.x * uNoiseFrequency, pos.y * uNoiseFrequency, t * 0.0001);
    pos.y += slowMod2 * layeredNoise(pos.y * uNoiseFrequency, pos.z * uNoiseFrequency, t * 0.00012);
    pos.z += slowMod * layeredNoise(pos.z * uNoiseFrequency, pos.x * uNoiseFrequency, t * 0.00008);
  }

  // --- Pointer repulsion (screen-space approximation) ---
  if (uEnablePointerRepulsion > 0.5 && uPointerDisturbance > 0.0) {
    vec2 screenApprox = vec2(pos.x / 3.0, pos.y / 3.0);
    vec2 diff = screenApprox - uPointerPos;
    float dist = length(diff) + 0.01;
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.5;
    pos.x += diff.x * influence;
    pos.y += diff.y * influence;
  }

  // --- Structural: field spread ---
  pos *= uFieldSpread;

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
  // Treble-modulated sparkle in lightness
  if (uTrebleEnergy > 0.4) {
    lightness += sin(t * 0.025 + aRandom.x * 1.7) * 0.18 * uTrebleEnergy;
  }
  vColor = hsl2rgb(hue, uPaletteSaturation, lightness);
}

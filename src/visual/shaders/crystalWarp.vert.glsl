// Crystal mode vertex shader — faceted/quantized deformation
// US-044: Volumetric crystalline displacement with angular character

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
uniform float uDisplacementScale;
uniform float uHasSizeAttr;
uniform float uFogNear;
uniform float uFocusDistance;
uniform float uDofStrength;

attribute float size;
attribute float aHueOffset;
attribute vec3 aRandom;

varying vec3 vColor;
varying float vDepth;
varying float vCoC;

const float TAU = 6.283185307;

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

  // Radial scale
  pos *= uRadialScale;

  // Bass-driven radial expansion
  float expansion = 1.0 + uBassEnergy * 0.25 * ma;
  pos *= expansion;

  // Quantized noise displacement — faceted/angular character
  float rawNoise = fbm3(pos * 0.5 + vec3(t * 0.00003 * uCadence), uNoiseOctaves);
  float quantized = floor(rawNoise * 4.0) / 4.0;
  vec3 noiseDir = normalize(pos + vec3(0.001));
  pos += noiseDir * quantized * (1.0 + uBassEnergy * 0.6) * uDisplacementScale * 0.3;

  // Two-axis twist (Y + X) for sculptural tumbling
  float twistY = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.3 * ma * uTwistStrength;
  float cosY = cos(twistY);
  float sinY = sin(twistY);
  pos = vec3(
    pos.x * cosY - pos.z * sinY,
    pos.y,
    pos.x * sinY + pos.z * cosY
  );

  float twistX = sin(t * 0.00025 * uCadence + aRandom.y * TAU) * 0.15 * ma * uTwistStrength;
  float cosX = cos(twistX);
  float sinX = sin(twistX);
  pos = vec3(
    pos.x,
    pos.y * cosX - pos.z * sinX,
    pos.y * sinX + pos.z * cosX
  );

  // Bass directional drift
  float bassDrift = uBassEnergy * 0.25 * ma;
  pos.x += sin(t * 0.0004 + aRandom.x * 11.0) * bassDrift;
  pos.y += cos(t * 0.0003 + aRandom.y * 13.0) * bassDrift;
  pos.z += sin(t * 0.0005 + aRandom.z * 7.0) * bassDrift;

  // Treble micro displacement
  float trebleJitter = uTrebleEnergy * 0.12 * ma;
  pos.x += sin(t * 0.011 + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.013 + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.009 + aRandom.z * 3.1) * trebleJitter;

  // Slow modulation
  if (uEnableSlowModulation > 0.5) {
    float slowMod = sin(t * 0.00015 + aRandom.x * TAU) * 0.08 * ma;
    float slowMod2 = cos(t * 0.0001 + aRandom.y * TAU) * 0.06 * ma;
    float nf = uNoiseFrequency;
    pos.x += slowMod * fbm3(vec3(pos.x * nf, pos.y * nf, t * 0.00005 * uCadence), uNoiseOctaves);
    pos.y += slowMod2 * fbm3(vec3(pos.y * nf, pos.z * nf, t * 0.00006 * uCadence), uNoiseOctaves);
    pos.z += slowMod * fbm3(vec3(pos.z * nf, pos.x * nf, t * 0.00004 * uCadence), uNoiseOctaves);
  }

  // Pointer repulsion
  if (uEnablePointerRepulsion > 0.5 && uPointerDisturbance > 0.0) {
    vec2 screenApprox = vec2(pos.x / 3.0, pos.y / 3.0);
    vec2 diff = screenApprox - uPointerPos;
    float dist = length(diff) + 0.01;
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.5;
    pos.x += diff.x * influence;
    pos.y += diff.y * influence;
  }

  // Field spread and breathing
  pos *= uFieldSpread;
  pos *= uBreathScale;

  // Point size with treble sparkle
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);
  vDepth = depth;
  float trebleSparkle = 1.0 + uTrebleEnergy * 0.4;
  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  float atmosphericDecay = exp(-0.08 * max(depth - uFogNear, 0.0));
  float sizeMultiplier = mix(1.0, size, uHasSizeAttr);
  float pointSize = sizeMultiplier * uBasePointSize * (2200.0 / depth) * trebleSparkle * atmosphericDecay;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 3.0) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 2.5, 96.0);

  gl_Position = projectionMatrix * mvPosition;

  // Color
  float hue = mod(uPaletteHue + aHueOffset, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;
  float lightness = 0.6;
  if (uTrebleEnergy > 0.5) {
    lightness += sin(t * 0.02 + aRandom.x * 1.3) * 0.15 * uTrebleEnergy;
  }
  vColor = hsl2rgb(hue, uPaletteSaturation, lightness);
}

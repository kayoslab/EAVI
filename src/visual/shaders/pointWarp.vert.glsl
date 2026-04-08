// Audio-driven 3D warp vertex shader for point cloud
// US-032: GPU-side deformation driven by bass/treble energy uniforms
// US-041: Simplex noise FBM for sculptural displacement

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
attribute vec3 aRandom;
attribute vec3 aVertexColor;

varying vec3 vColor;
varying vec3 vVertexColor;
varying float vDepth;
varying float vCoC;

const float TAU = 6.283185307;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Bass macro deformation ---
  // Radial expansion
  float expansion = 1.0 + uBassEnergy * 0.25 * ma;
  pos *= expansion;

  // Bass-driven macro noise displacement (sculptural 3D simplex FBM)
  float bassNoise = fbm3(pos * 0.5 + vec3(t * 0.00003 * uCadence), uNoiseOctaves);
  vec3 bassNoiseDir = normalize(pos + vec3(0.001));
  pos += bassNoiseDir * bassNoise * uBassEnergy * uDisplacementScale * 0.3;

  // Twist around Y axis (differential per-point), scaled by structural twist
  float twistAngle = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.3 * ma * uTwistStrength;
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

  // --- Time evolution (slow modulation via simplex FBM) ---
  if (uEnableSlowModulation > 0.5) {
    float slowMod = sin(t * 0.00015 + aRandom.x * TAU) * 0.08 * ma;
    float slowMod2 = cos(t * 0.0001 + aRandom.y * TAU) * 0.06 * ma;
    float nf = uNoiseFrequency;
    pos.x += slowMod * fbm3(vec3(pos.x * nf, pos.y * nf, t * 0.00005 * uCadence), uNoiseOctaves);
    pos.y += slowMod2 * fbm3(vec3(pos.y * nf, pos.z * nf, t * 0.00006 * uCadence), uNoiseOctaves);
    pos.z += slowMod * fbm3(vec3(pos.z * nf, pos.x * nf, t * 0.00004 * uCadence), uNoiseOctaves);
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

  // --- Point size with treble sparkle modulation ---
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  float depth = max(0.25, -mvPosition.z);
  vDepth = depth;
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.35;

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

  // --- Color from vibrant vertex color attribute ---
  vVertexColor = aVertexColor;
  float brightness = 1.0;
  if (uTrebleEnergy > 0.5) {
    brightness += sin(t * 0.02 + aRandom.x * 1.3) * 0.15 * uTrebleEnergy;
  }
  vColor = aVertexColor * brightness;
}

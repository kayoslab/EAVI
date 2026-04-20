// Flow-field ribbon vertex shader
// US-063: Curl noise advection for streaming tendril/aurora motion

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
uniform float uMidEnergy;
uniform float uFocusDistance;
uniform float uDofStrength;
uniform float uFlowScale;

attribute float size;
attribute vec3 aRandom;
attribute vec3 aVertexColor;
attribute float aTrailProgress;

varying vec3 vColor;
varying vec3 vVertexColor;
varying float vFogDepth;
varying float vElongation;
varying float vCoC;
varying float vTrailProgress;

const float TAU = 6.283185307;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Flow-field advection via curl3 ---
  // Primary curl noise displacement — divergence-free streaming motion
  vec3 vel = curl3(pos * uNoiseFrequency * 0.5 + vec3(t * 0.00005 * uCadence), uNoiseOctaves);
  float speed = length(vel);

  // Bass modulates curve amplitude (macro sweep)
  vel *= (0.3 + uBassEnergy * 0.7) * uFlowScale;
  pos += vel;

  // --- Turbulence via high-frequency curl3 ---
  // Treble modulates fine turbulence detail
  vec3 turb = curl3(pos * uNoiseFrequency * 1.5 + vec3(t * 0.0001), max(1, uNoiseOctaves - 1));
  pos += turb * uTrebleEnergy * 0.15 * ma;

  // --- Twist modulation ---
  float twistAngle = speed * uTwistStrength * 0.3 * sin(t * 0.0002 + aRandom.x * TAU) * ma;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // --- Always-on gentle shape evolution (audio-independent) ---
  float autoMorph = sin(t * 0.00008 + aRandom.x * TAU) * 0.05;
  pos += normalize(pos + vec3(0.001)) * autoMorph;

  // --- Time evolution (slow modulation) ---
  if (uEnableSlowModulation > 0.5) {
    float slowDrift = sin(t * 0.00012 + aRandom.y * TAU) * 0.10 * ma;
    pos += curl3(pos * 0.3 + vec3(t * 0.00003), max(1, uNoiseOctaves - 1)) * slowDrift;
  }

  // --- Pointer repulsion ---
  if (uEnablePointerRepulsion > 0.5 && uPointerDisturbance > 0.0) {
    vec2 screenApprox = vec2(pos.x / 3.0, pos.y / 3.0);
    vec2 diff = screenApprox - uPointerPos;
    float dist = length(diff) + 0.01;
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.8;
    pos.x += diff.x * influence;
    pos.y += diff.y * influence;
  }

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Breathing scale ---
  pos *= uBreathScale;

  // --- Elongation varying for fragment shader ---
  // Maps velocity magnitude to 0..1 range for elliptical sprite stretching
  vElongation = clamp(speed * 0.5, 0.0, 1.0);

  // --- Point size with velocity-based elongation ---
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);
  vFogDepth = depth;

  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  float atmosphericDecay = exp(-0.12 * max(depth - uFogNear, 0.0));
  float sizeMultiplier = mix(1.0, size, uHasSizeAttr);
  // Treble modulates ribbon thickness
  float trebleSize = 0.6 + uTrebleEnergy * 0.8;
  // Elongate point size based on flow speed
  float elongationBoost = 1.0 + speed * 2.0;
  float pointSize = sizeMultiplier * uBasePointSize * (1200.0 / depth) * elongationBoost * atmosphericDecay * trebleSize;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 1.5) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 2.5, 40.0);

  gl_Position = projectionMatrix * mvPosition;

  // --- Trail progress varying for tail fade ---
  vTrailProgress = aTrailProgress;

  // --- Color from vibrant vertex color attribute ---
  vVertexColor = aVertexColor;
  float brightness = 1.0 + speed * 0.1;
  if (uTrebleEnergy > 0.3) {
    brightness += sin(t * 0.02 + aRandom.x * 1.7) * 0.15 * uTrebleEnergy;
  }
  vColor = aVertexColor * clamp(brightness, 0.3, 1.5);
}

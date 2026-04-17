// Wireframe polyhedra vertex shader
// US-054: Audio-reactive displacement for wireframe edge vertices
// US-072: Removed treble micro displacement, gated slow modulation behind bass, reduced drift

uniform float uTime;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uMotionAmplitude;
uniform float uNoiseFrequency;
uniform float uRadialScale;
uniform float uTwistStrength;
uniform float uFieldSpread;
uniform float uBreathScale;
uniform float uCadence;
uniform int uNoiseOctaves;
uniform float uDisplacementScale;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEnableSlowModulation;
uniform float uEnablePointerRepulsion;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;

attribute vec3 aRandom;

varying float vFogFactor;
varying vec3 vWorldPos;

const float TAU = 6.283185307;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Bass macro deformation ---
  float expansion = 1.0 + uBassEnergy * 0.25 * ma;
  pos *= expansion;

  // --- Bass growth pulse: tips expand more than trunk (aRandom.y = depthRatio) ---
  float growthPulse = 1.0 + uBassEnergy * aRandom.y * 0.15;
  pos *= growthPulse;

  // Bass-driven macro noise displacement
  float bassNoise = fbm3(pos * 0.5 + vec3(t * 0.00003 * uCadence), uNoiseOctaves);
  vec3 bassNoiseDir = normalize(pos + vec3(0.001));
  pos += bassNoiseDir * bassNoise * uBassEnergy * uDisplacementScale * 0.15;

  // Twist around Y axis
  float twistAngle = uBassEnergy * sin(t * 0.0003) * 0.15 * ma * uTwistStrength;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // Bass directional drift — use position for phase so edges and vertices stay coherent
  float bassDrift = uBassEnergy * 0.08 * ma;
  vec3 origPos = position * uRadialScale;
  pos.x += sin(t * 0.0004 + origPos.y * 3.0 + origPos.z * 2.0) * bassDrift;
  pos.y += cos(t * 0.0003 + origPos.x * 3.0 + origPos.z * 2.0) * bassDrift;
  pos.z += sin(t * 0.0005 + origPos.x * 2.0 + origPos.y * 3.0) * bassDrift;

  // --- Optional slow modulation (gated behind bass energy) ---
  if (uEnableSlowModulation > 0.5) {
    float bassGate = smoothstep(0.05, 0.3, uBassEnergy);
    float slowNoise = fbm3(pos * 0.3 + vec3(t * 0.00001), uNoiseOctaves);
    pos += normalize(pos + vec3(0.001)) * slowNoise * 0.15 * ma * bassGate;
  }

  // --- Optional pointer repulsion ---
  if (uEnablePointerRepulsion > 0.5) {
    vec2 screenPos = pos.xy;
    vec2 diff = screenPos - uPointerPos;
    float dist = length(diff) + 0.001;
    float repulse = uPointerDisturbance * 0.15 / (dist * dist + 0.5);
    pos.xy += normalize(diff) * repulse * 0.05;
  }

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Breathing scale ---
  pos *= uBreathScale;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  // Compute fog factor in vertex shader for fragment use
  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  vWorldPos = pos;

  gl_Position = projectionMatrix * mvPosition;
}

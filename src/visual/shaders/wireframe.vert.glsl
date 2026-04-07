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

  // Bass-driven macro noise displacement
  float bassNoise = fbm3(pos * 0.5 + vec3(t * 0.00003 * uCadence), uNoiseOctaves);
  vec3 bassNoiseDir = normalize(pos + vec3(0.001));
  pos += bassNoiseDir * bassNoise * uBassEnergy * uDisplacementScale * 0.3;

  // Twist around Y axis
  float twistAngle = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.3 * ma * uTwistStrength;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // Bass directional drift
  float bassDrift = uBassEnergy * 0.15 * ma;
  pos.x += sin(t * 0.0004 + aRandom.x * 11.0) * bassDrift;
  pos.y += cos(t * 0.0003 + aRandom.y * 13.0) * bassDrift;
  pos.z += sin(t * 0.0005 + aRandom.z * 7.0) * bassDrift;

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
    float repulse = uPointerDisturbance * 0.3 / (dist * dist + 0.5);
    pos.xy += normalize(diff) * repulse * 0.1;
  }

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Breathing scale ---
  pos *= uBreathScale;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  // Compute fog factor in vertex shader for fragment use
  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  gl_Position = projectionMatrix * mvPosition;
}

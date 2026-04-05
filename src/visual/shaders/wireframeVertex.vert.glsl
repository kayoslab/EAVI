// Wireframe vertex dot shader
// US-065: Points at polyhedron vertices with identical deformation to edge shader

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
uniform float uBasePointSize;

attribute vec3 aRandom;

varying float vFogFactor;
varying float vDepth;

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
  float bassDrift = uBassEnergy * 0.25 * ma;
  pos.x += sin(t * 0.0004 + aRandom.x * 11.0) * bassDrift;
  pos.y += cos(t * 0.0003 + aRandom.y * 13.0) * bassDrift;
  pos.z += sin(t * 0.0005 + aRandom.z * 7.0) * bassDrift;

  // --- Treble micro displacement ---
  float trebleJitter = uTrebleEnergy * 0.12 * ma;
  pos.x += sin(t * 0.011 + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.013 + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.009 + aRandom.z * 3.1) * trebleJitter;

  // --- Optional slow modulation ---
  if (uEnableSlowModulation > 0.5) {
    float slowNoise = fbm3(pos * 0.3 + vec3(t * 0.00001), uNoiseOctaves);
    pos += normalize(pos + vec3(0.001)) * slowNoise * 0.15 * ma;
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
  vDepth = depth;

  // Compute fog factor
  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  // --- Point size with treble sparkle ---
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.35;
  float atmosphericDecay = exp(-0.08 * max(depth - uFogNear, 0.0));
  float pointSize = uBasePointSize * (2200.0 / depth) * trebleSparkle * atmosphericDecay;
  gl_PointSize = clamp(pointSize, 2.5, 48.0);

  gl_Position = projectionMatrix * mvPosition;
}

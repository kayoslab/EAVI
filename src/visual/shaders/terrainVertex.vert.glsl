// Terrain heightfield vertex (Points) shader
// US-074: Audio-reactive terrain vertices with treble shimmer

uniform float uTime;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uMotionAmplitude;
uniform float uNoiseFrequency;
uniform float uCadence;
uniform int uNoiseOctaves;
uniform float uFogNear;
uniform float uFogFar;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;

attribute vec3 aRandom;

varying float vFogFactor;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Bass macro displacement: rolling wave across terrain ---
  float bassWave = fbm3(vec3(pos.x * 0.15, pos.z * 0.15, t * 0.0002 * uCadence), uNoiseOctaves);
  pos.y += bassWave * uBassEnergy * ma * 1.5;

  // --- Treble fine vertex jitter ---
  float jitter = snoise(pos * 3.0 + vec3(t * 0.003)) * uTrebleEnergy * ma * 0.15;
  pos.y += jitter;

  // --- Pointer disturbance ---
  vec2 diff = pos.xz * 0.1 - uPointerPos;
  float dist = length(diff) + 0.001;
  float repulse = uPointerDisturbance * 0.2 / (dist * dist + 1.0);
  pos.y += repulse * 0.3;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  // --- Point size with treble shimmer ---
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.5;
  float atmosphericDecay = exp(-0.06 * max(depth - uFogNear, 0.0));
  float pointSize = 0.04 * (2200.0 / depth) * trebleSparkle * atmosphericDecay;
  gl_PointSize = clamp(pointSize, 2.0, 40.0);

  gl_Position = projectionMatrix * mvPosition;
}

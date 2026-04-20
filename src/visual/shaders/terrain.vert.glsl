// Terrain heightfield edge vertex shader
// US-074: Audio-reactive terrain grid wireframe (LineSegments)

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
attribute vec3 aVertexColor;

varying float vFogFactor;
varying vec3 vVertexColor;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Bass macro displacement: rolling wave across terrain ---
  float bassWave = fbm3(vec3(pos.x * 0.05, pos.z * 0.05, t * 0.00006 * uCadence), uNoiseOctaves);
  pos.y += bassWave * uBassEnergy * ma * 0.8;

  // --- Treble fine vertex jitter ---
  float jitter = snoise(pos * 3.0 + vec3(t * 0.003)) * uTrebleEnergy * ma * 0.08;
  pos.y += jitter;

  // --- Pointer disturbance ---
  vec2 diff = pos.xz * 0.1 - uPointerPos;
  float dist = length(diff) + 0.001;
  float repulse = uPointerDisturbance * 0.2 / (dist * dist + 1.0);
  pos.y += repulse * 0.3;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  vVertexColor = aVertexColor;

  gl_Position = projectionMatrix * mvPosition;
}

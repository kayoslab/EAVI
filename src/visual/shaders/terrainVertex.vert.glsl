// Terrain dense particle wave sheet vertex shader
// US-076: Continuous wave animation + bass amplitude + treble shimmer

uniform float uTime;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uMotionAmplitude;
uniform float uNoiseFrequency;
uniform float uCadence;
uniform int uNoiseOctaves;
uniform float uFogNear;
uniform float uFogFar;
uniform float uFocusDistance;
uniform float uDofStrength;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;

attribute vec3 aRandom;
attribute vec3 aVertexColor;

varying float vFogFactor;
varying vec3 vVertexColor;
varying float vCoC;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Continuous time-based wave (rolls even without audio) ---
  float baseWave = fbm3(vec3(pos.x * 0.06, pos.z * 0.06, t * 0.0002 * uCadence), uNoiseOctaves);
  // Bass SCALES wave amplitude
  float bassScale = 1.0 + uBassEnergy * 1.5;
  pos.y += baseWave * ma * bassScale;

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

  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  // --- Small dense point size with treble shimmer ---
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.5;
  float atmosphericDecay = exp(-0.06 * max(depth - uFogNear, 0.0));
  float pointSize = 4.0 * (1800.0 / depth) * trebleSparkle * atmosphericDecay;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 3.0) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 1.0, 32.0);

  vVertexColor = aVertexColor;

  gl_Position = projectionMatrix * mvPosition;
}

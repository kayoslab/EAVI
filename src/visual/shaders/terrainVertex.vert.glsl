// Terrain grid landscape vertex shader
// Regular grid of points forming hills and valleys viewed from low angle

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

  // --- Gentle wave animation over the grid surface ---
  float wave = fbm3(vec3(pos.x * 0.05, pos.z * 0.03, t * 0.00006 * uCadence), uNoiseOctaves);
  float bassScale = 1.0 + uBassEnergy * 0.4;
  pos.y += wave * ma * bassScale * 0.8;

  // --- Treble shimmer: subtle per-vertex y displacement ---
  float shimmer = snoise(pos * 2.0 + vec3(t * 0.001 * uCadence)) * uTrebleEnergy * ma * 0.08;
  pos.y += shimmer;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.5, -mvPosition.z);

  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  // --- Point size: small crisp dots, perspective-scaled ---
  float trebleSparkle = 1.0 + max(0.0, snoise(pos * 4.0 + vec3(t * 0.002))) * uTrebleEnergy * 0.3;
  float atmosphericDecay = exp(-0.02 * max(depth - uFogNear, 0.0));
  float pointSize = 3.0 * (300.0 / depth) * trebleSparkle * atmosphericDecay;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 0.8) : (1.0 + coc * 0.3);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 1.0, 8.0);

  vVertexColor = aVertexColor;

  gl_Position = projectionMatrix * mvPosition;
}

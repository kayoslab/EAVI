// 3D object wireframe vertex shader — radial displacement

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

  // Radial direction from center
  vec3 dir = normalize(pos + vec3(0.001));

  // Bass: radial expansion + FBM displacement
  float bassScale = 1.0 + uBassEnergy * 0.3;
  pos *= bassScale;

  float wave = fbm3(pos * 0.5 + vec3(t * 0.00006 * uCadence), uNoiseOctaves);
  pos += dir * wave * ma * uBassEnergy * 0.4;

  // Treble: radial micro-shimmer
  float shimmer = snoise(pos * 2.0 + vec3(t * 0.001 * uCadence)) * uTrebleEnergy * ma * 0.06;
  pos += dir * shimmer;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  vFogFactor = smoothstep(uFogNear, uFogFar, depth);
  vVertexColor = aVertexColor;

  gl_Position = projectionMatrix * mvPosition;
}

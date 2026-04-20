// Bezier curve web vertex shader
// US-067: Arc offset modulation with bass energy + same deformation pipeline as constellation

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
uniform float uMidEnergy;
uniform float uBassArcScale;

attribute vec3 aArcOffset;
attribute float aEdgeParam;
attribute float aDistance;
attribute vec3 aRandom;

varying float vAlpha;
varying float vDepth;

const float TAU = 6.283185307;
const float PI = 3.141592654;

void main() {
  // Apply arc offset modulated by bass energy
  vec3 pos = position + aArcOffset * uBassArcScale;

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
  pos.x += sin(t * 0.005 * uCadence + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.006 * uCadence + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.009 + aRandom.z * 3.1) * trebleJitter;

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Breathing scale ---
  pos *= uBreathScale;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);
  vDepth = depth;

  // Distance-based alpha (aDistance is normalized 0-1 where 0=close, 1=far)
  vAlpha = 1.0 - aDistance;

  gl_Position = projectionMatrix * mvPosition;
}

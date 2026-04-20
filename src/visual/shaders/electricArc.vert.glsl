// Electric arc vertex shader
// US-060: Noise-based lateral displacement along line edges for electric discharge effect

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
uniform float uEnableSlowModulation;
uniform float uEnablePointerRepulsion;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;
uniform float uArcIntensity;
uniform float uArcSpeed;
uniform float uArcFrequency;

attribute vec3 aRandom;
attribute float aEdgeParam;
attribute vec3 aEdgeTangent;

varying float vFogFactor;
varying float vArcDisplacement;

const float TAU = 6.283185307;
const float PI = 3.141592653;

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
  pos.x += sin(t * 0.005 * uCadence + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.006 * uCadence + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.004 * uCadence + aRandom.z * 3.1) * trebleJitter;

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

  // --- Electric arc lateral displacement ---
  // Compute two perpendicular vectors to edge tangent
  vec3 tangent = normalize(aEdgeTangent);
  vec3 up = vec3(0.0, 1.0, 0.0);
  // Fall back to (1,0,0) when tangent is near-vertical
  if (abs(dot(tangent, up)) > 0.95) {
    up = vec3(1.0, 0.0, 0.0);
  }
  vec3 perp1 = normalize(cross(tangent, up));
  vec3 perp2 = normalize(cross(tangent, perp1));

  // Sample noise for lateral displacement on each perpendicular axis
  float noiseCoord = aEdgeParam * uArcFrequency;
  float timeCoord = t * uArcSpeed * 0.001;
  float n1 = snoise(vec3(noiseCoord, timeCoord, aRandom.x * 10.0));
  float n2 = snoise(vec3(noiseCoord + 37.0, timeCoord + 13.0, aRandom.y * 10.0));

  // Scale by treble energy, arc intensity, and endpoint tapering (aEdgeParam is already tapered via sin(PI*t))
  float arcScale = uArcIntensity * aEdgeParam * ma;
  float lateralDisp1 = n1 * arcScale * 0.15;
  float lateralDisp2 = n2 * arcScale * 0.15;

  pos += perp1 * lateralDisp1 + perp2 * lateralDisp2;

  // Pass displacement magnitude for fragment glow
  vArcDisplacement = abs(lateralDisp1) + abs(lateralDisp2);

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Breathing scale ---
  pos *= uBreathScale;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);

  // Compute fog factor
  float dynamicFogFar = uFogFar * (1.0 - uMidEnergy * 0.15);
  vFogFactor = smoothstep(uFogNear, dynamicFogFar, depth);

  gl_Position = projectionMatrix * mvPosition;
}

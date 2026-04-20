// Wireframe vertex dot shader
// US-065: Points at polyhedron vertices with identical deformation to edge shader
// US-072: Removed treble micro displacement, gated slow modulation, added connectivity emphasis

uniform float uTime;
uniform float uBassEnergy;
uniform float uBeatPulse;
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
uniform float uBasePointSize;
uniform float uFocusDistance;
uniform float uDofStrength;

attribute vec3 aRandom;
attribute float aConnectivity;

varying float vFogFactor;
varying float vDepth;
varying float vConnectivity;
varying float vCoC;
varying vec3 vWorldPos;

const float TAU = 6.283185307;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // Pass connectivity to fragment shader (normalized by max 6 edges per interior vertex)
  vConnectivity = aConnectivity / 6.0;

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

  // Beat pulse: brief radial expansion
  pos *= 1.0 + uBeatPulse * 0.03;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float depth = max(0.25, -mvPosition.z);
  vDepth = depth;

  // Compute fog factor
  float dynamicFogFar = uFogFar * (1.0 - uMidEnergy * 0.15);
  vFogFactor = smoothstep(uFogNear, dynamicFogFar, depth);

  vWorldPos = pos;

  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  // --- Point size with treble sparkle and connectivity emphasis ---
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.35;
  // Tip sparkle: tips (aRandom.y≈1) sparkle more with treble
  trebleSparkle *= (1.0 + uTrebleEnergy * aRandom.y * 0.5);
  float atmosphericDecay = exp(-0.08 * max(depth - uFogNear, 0.0));
  float connectivityBoost = 1.0 + vConnectivity * 0.5;
  float pointSize = uBasePointSize * (1200.0 / depth) * trebleSparkle * atmosphericDecay * connectivityBoost;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 1.5) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 2.5, 40.0);

  gl_Position = projectionMatrix * mvPosition;
}

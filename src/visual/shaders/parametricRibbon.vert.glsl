// US-083: Parametric surface ribbon vertex shader
// Bass deforms host surface via aCurveParam; treble drives ribbon shimmer

uniform float uTime;
uniform float uBassEnergy;
uniform float uTrebleEnergy;
uniform float uMotionAmplitude;
uniform float uPointerDisturbance;
uniform vec2 uPointerPos;
uniform float uPaletteHue;
uniform float uPaletteSaturation;
uniform float uCadence;
uniform float uBreathScale;
uniform float uBasePointSize;
uniform float uNoiseFrequency;
uniform float uRadialScale;
uniform float uTwistStrength;
uniform float uFieldSpread;
uniform int uNoiseOctaves;
uniform float uEnablePointerRepulsion;
uniform float uEnableSlowModulation;
uniform float uDisplacementScale;
uniform float uHasSizeAttr;
uniform float uFogNear;
uniform float uMidEnergy;
uniform float uFocusDistance;
uniform float uDofStrength;

attribute float size;
attribute vec3 aRandom;
attribute vec3 aVertexColor;
attribute float aCurveParam;

varying vec3 vColor;
varying vec3 vVertexColor;
varying float vDepth;
varying float vCoC;
varying float vCurveParam;

const float TAU = 6.283185307;

void main() {
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;
  float cp = aCurveParam;

  // Pass curve param to fragment
  vCurveParam = cp;

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Bass deforms the host surface: coherent wave along ribbon ---
  float bassWave = sin(cp * TAU * 3.0 + t * 0.0005) * uBassEnergy * uDisplacementScale * 0.4;
  vec3 bassDir = normalize(pos + vec3(0.001));
  pos += bassDir * bassWave * ma;

  // Bass-driven macro noise displacement (sculptural 3D simplex FBM)
  float bassNoise = fbm3(pos * 0.5 + vec3(t * 0.00003 * uCadence), uNoiseOctaves);
  pos += bassDir * bassNoise * uBassEnergy * uDisplacementScale * 0.2;

  // Radial expansion driven by bass
  float expansion = 1.0 + uBassEnergy * 0.2 * ma;
  pos *= expansion;

  // Sinusoidal ribbon sway — phase aligned to curve param
  float ribbonPhase = cp * TAU * 2.0 + t * 0.0004;
  float bassSway = uBassEnergy * sin(ribbonPhase + aRandom.x * TAU) * 0.3 * ma;
  pos.y += bassSway;
  pos.x += cos(ribbonPhase * 0.7 + aRandom.y * TAU) * uBassEnergy * 0.15 * ma;

  // Twist around Y axis, scaled by structural twist
  float twistAngle = uBassEnergy * sin(t * 0.0003 + aRandom.x * TAU) * 0.35 * ma * uTwistStrength;
  float cosT = cos(twistAngle);
  float sinT = sin(twistAngle);
  pos = vec3(
    pos.x * cosT - pos.z * sinT,
    pos.y,
    pos.x * sinT + pos.z * cosT
  );

  // --- Treble drives ribbon shimmer: high-freq per-point displacement ---
  float shimmerPhase = cp * 20.0 + t * 0.02 + aRandom.x * TAU;
  float trebleShimmer = uTrebleEnergy * 0.1 * ma;
  pos.x += sin(shimmerPhase) * trebleShimmer;
  pos.y += cos(shimmerPhase * 1.3 + aRandom.y * 3.0) * trebleShimmer;
  pos.z += sin(shimmerPhase * 0.7 + aRandom.z * 5.0) * trebleShimmer;

  // Standard treble micro jitter
  float trebleJitter = uTrebleEnergy * 0.08 * ma;
  pos.x += sin(t * 0.006 * uCadence + aRandom.x * 9.1) * trebleJitter;
  pos.y += cos(t * 0.007 * uCadence + aRandom.y * 7.3) * trebleJitter;
  pos.z += sin(t * 0.005 * uCadence + aRandom.z * 5.7) * trebleJitter;

  // --- Time evolution (slow modulation via simplex FBM) ---
  if (uEnableSlowModulation > 0.5) {
    float slowMod = sin(t * 0.00015 + aRandom.x * TAU) * 0.08 * ma;
    float slowMod2 = cos(t * 0.0001 + aRandom.y * TAU) * 0.06 * ma;
    float nf = uNoiseFrequency;
    pos.x += slowMod * fbm3(vec3(pos.x * nf, pos.y * nf, t * 0.00005 * uCadence), uNoiseOctaves);
    pos.y += slowMod2 * fbm3(vec3(pos.y * nf, pos.z * nf, t * 0.00006 * uCadence), uNoiseOctaves);
    pos.z += slowMod * fbm3(vec3(pos.z * nf, pos.x * nf, t * 0.00004 * uCadence), uNoiseOctaves);
  }

  // --- Pointer repulsion (screen-space approximation) ---
  if (uEnablePointerRepulsion > 0.5 && uPointerDisturbance > 0.0) {
    vec2 screenApprox = vec2(pos.x / 3.0, pos.y / 3.0);
    vec2 diff = screenApprox - uPointerPos;
    float dist = length(diff) + 0.01;
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.8;
    pos.x += diff.x * influence;
    pos.y += diff.y * influence;
  }

  // --- Structural: field spread ---
  pos *= uFieldSpread;

  // --- Apply breathing scale ---
  pos *= uBreathScale;

  // --- Point size with treble sparkle modulation ---
  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

  float depth = max(0.25, -mvPosition.z);
  vDepth = depth;
  float sparkleNoise = snoise(pos * 3.0 + vec3(t * 0.005));
  float trebleSparkle = 1.0 + max(0.0, sparkleNoise) * uTrebleEnergy * 0.35;

  // --- DoF circle-of-confusion ---
  float coc = abs(depth - uFocusDistance) / uFocusDistance;
  coc = clamp(coc * uDofStrength, 0.0, 1.0);
  vCoC = coc;

  float atmosphericDecay = exp(-0.08 * max(depth - uFogNear, 0.0));
  float sizeMultiplier = mix(1.0, size, uHasSizeAttr);
  float pointSize = sizeMultiplier * uBasePointSize * (1200.0 / depth) * trebleSparkle * atmosphericDecay;
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 1.5) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 2.5, 40.0);

  gl_Position = projectionMatrix * mvPosition;

  // --- Color from vibrant vertex color attribute ---
  vVertexColor = aVertexColor;
  float brightness = 1.0;
  if (uTrebleEnergy > 0.4) {
    brightness += sin(t * 0.025 + aRandom.x * 1.7) * 0.18 * uTrebleEnergy;
  }
  // Subtle length-based brightness: brighter at ribbon center
  float edgeDim = 1.0 - 0.15 * (1.0 - 4.0 * (cp - 0.5) * (cp - 0.5));
  vColor = aVertexColor * brightness * edgeDim;
}

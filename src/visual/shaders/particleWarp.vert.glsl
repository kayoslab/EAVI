// Audio-driven 3D particle field vertex shader
// US-082: CPU owns macro flow (curl advection), GPU owns micro detail (treble)

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
uniform float uHasSizeAttr;
uniform float uFogNear;
uniform float uFocusDistance;
uniform float uDofStrength;

attribute float size;
attribute vec3 aRandom;
attribute vec3 aVertexColor;
attribute float aAlpha;

varying vec3 vColor;
varying vec3 vVertexColor;
varying float vDepth;
varying float vCoC;
varying float vAlpha;

const float TAU = 6.283185307;

void main() {
  // Position is CPU-uploaded (already advected along curl field)
  vec3 pos = position;
  float t = uTime;
  float ma = uMotionAmplitude;

  // --- Structural: radial scale ---
  pos *= uRadialScale;

  // --- Treble micro displacement (GPU micro-detail) ---
  float trebleJitter = uTrebleEnergy * 0.12 * ma;
  pos.x += sin(t * 0.005 * uCadence + aRandom.x * 7.3) * trebleJitter;
  pos.y += cos(t * 0.006 * uCadence + aRandom.y * 5.7) * trebleJitter;
  pos.z += sin(t * 0.004 * uCadence + aRandom.z * 3.1) * trebleJitter;

  // Treble fine-grain noise displacement
  float trebleFine = snoise(pos * 3.0 * uNoiseFrequency + vec3(t * 0.002)) * uTrebleEnergy * 0.08 * ma;
  pos += normalize(pos + vec3(0.001)) * trebleFine;

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
    float influence = max(0.0, 1.0 - dist * 2.0) * uPointerDisturbance * ma * 0.5;
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
  // Bokeh size scaling: foreground gets large soft circles, background slight increase
  float bokehScale = (depth < uFocusDistance) ? (1.0 + coc * 1.5) : (1.0 + coc * 0.5);
  pointSize *= bokehScale;
  gl_PointSize = clamp(pointSize, 2.5, 40.0);

  gl_Position = projectionMatrix * mvPosition;

  // --- Fade-in alpha from CPU recycling ---
  vAlpha = aAlpha;

  // --- Color from vibrant vertex color attribute ---
  vVertexColor = aVertexColor;
  float brightness = 1.0;
  if (uTrebleEnergy > 0.5) {
    brightness += sin(t * 0.02 + aRandom.x * 1.3) * 0.15 * uTrebleEnergy;
  }
  vColor = aVertexColor * brightness;
}

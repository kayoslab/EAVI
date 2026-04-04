// Instanced micro-geometry vertex shader
// US-056: Audio-reactive instanced 3D primitives

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
uniform float uNoiseFrequency;
uniform float uRadialScale;
uniform float uTwistStrength;
uniform float uFieldSpread;
uniform int uNoiseOctaves;
uniform float uEnablePointerRepulsion;
uniform float uEnableSlowModulation;
uniform float uDisplacementScale;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying float vFogFactor;
varying vec3 vNormal;

const float TAU = 6.283185307;

// HSL to RGB conversion
vec3 hsl2rgb(float h, float s, float l) {
  float c = (1.0 - abs(2.0 * l - 1.0)) * s;
  float hp = h * 6.0;
  float x = c * (1.0 - abs(mod(hp, 2.0) - 1.0));
  float m = l - c * 0.5;
  vec3 rgb;
  if (hp < 1.0) rgb = vec3(c, x, 0.0);
  else if (hp < 2.0) rgb = vec3(x, c, 0.0);
  else if (hp < 3.0) rgb = vec3(0.0, c, x);
  else if (hp < 4.0) rgb = vec3(0.0, x, c);
  else if (hp < 5.0) rgb = vec3(x, 0.0, c);
  else rgb = vec3(c, 0.0, x);
  return rgb + m;
}

void main() {
  // Instance position is embedded in the instance matrix (columns 3 of the 4x4)
  // Three.js provides instanceMatrix automatically for InstancedMesh
  vec4 worldPos = instanceMatrix * vec4(position, 1.0);
  vec3 instancePos = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);

  // Bass macro displacement via curl noise field
  float t = uTime;
  float ma = uMotionAmplitude;
  vec3 curlSample = instancePos * 0.4 + vec3(t * 0.0003 * uCadence);
  vec3 curlDisp = curl3(curlSample, uNoiseOctaves);
  worldPos.xyz += curlDisp * uBassEnergy * uDisplacementScale * 0.25 * ma;

  // Treble micro shimmer on vertex positions
  float trebleJitter = uTrebleEnergy * 0.06 * ma;
  float vertHash = dot(position, vec3(7.3, 5.7, 3.1));
  worldPos.x += sin(t * 0.011 + vertHash) * trebleJitter;
  worldPos.y += cos(t * 0.013 + vertHash * 1.3) * trebleJitter;
  worldPos.z += sin(t * 0.009 + vertHash * 0.7) * trebleJitter;

  // Breathing scale
  worldPos.xyz *= uBreathScale;

  // Field spread
  worldPos.xyz *= uFieldSpread;

  vec4 mvPosition = modelViewMatrix * worldPos;
  gl_Position = projectionMatrix * mvPosition;

  // Depth for fog
  float depth = -mvPosition.z;
  vFogFactor = smoothstep(uFogNear, uFogFar, depth);

  // Transform normal by instance rotation (upper 3x3 of instanceMatrix)
  mat3 instanceNormalMatrix = mat3(instanceMatrix);
  vNormal = normalize(normalMatrix * instanceNormalMatrix * normal);

  // Color: palette hue + per-instance variation derived from instance position
  float instanceHueOffset = snoise(instancePos * 2.0) * 30.0;
  float hue = mod(uPaletteHue + instanceHueOffset, 360.0) / 360.0;
  if (hue < 0.0) hue += 1.0;
  float lightness = 0.55 + uTrebleEnergy * 0.1 * sin(t * 0.02 + instancePos.x * 3.0);
  vColor = hsl2rgb(hue, uPaletteSaturation, lightness);
}

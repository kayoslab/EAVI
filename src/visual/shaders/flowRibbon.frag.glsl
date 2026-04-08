// Flow-field ribbon fragment shader
// US-063: Elongated soft sprites with atmospheric fog

uniform float uOpacity;
uniform float uFogNear;
uniform float uFogFar;

varying vec3 vColor;
varying float vFogDepth;
varying float vElongation;
varying float vCoC;

void main() {
  // Elongated elliptical point shape
  // Stretch gl_PointCoord along X axis based on velocity elongation
  vec2 uv = gl_PointCoord - 0.5;
  uv.x *= mix(1.0, 0.4, vElongation);
  float dist = length(uv);

  // Discard outside radius
  if (dist > 0.5) discard;

  // Soft edge falloff — CoC-dependent bokeh softness
  float innerFade = mix(0.25, 0.05, vCoC);
  float alpha = smoothstep(0.5, innerFade, dist);
  alpha *= mix(1.0, 0.35, vCoC);

  // Atmospheric depth fog
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);

  // Depth-based color desaturation (cool shift)
  vec3 color = vColor;
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.6, lum * 0.65, lum * 0.8);
  color = mix(color, fogTint, fogFactor * 0.5);

  // Fog alpha attenuation
  float fogAlpha = alpha * (1.0 - fogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, fogAlpha);
}

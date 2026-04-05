// Instanced micro-geometry fragment shader
// US-056: Lit 3D primitives with depth fog

uniform float uOpacity;
uniform float uDispersion;

varying vec3 vColor;
varying float vFogFactor;
varying vec3 vNormal;

void main() {
  // Simple directional lighting for 3D depth perception
  vec3 lightDir = normalize(vec3(0.3, 0.6, 0.8));
  float diffuse = max(dot(vNormal, lightDir), 0.0);
  float ambient = 0.35;
  float lighting = ambient + diffuse * 0.65;

  vec3 color = vColor * lighting;

  // Chromatic dispersion: multiplicative RGB channel shift
  color = chromaticLine(color, uDispersion);

  // Depth-based color desaturation
  float lum = dot(color, vec3(0.299, 0.587, 0.114));
  vec3 fogTint = vec3(lum * 0.6, lum * 0.65, lum * 0.8);
  color = mix(color, fogTint, vFogFactor * 0.5);

  // Fog alpha attenuation
  float alpha = (1.0 - vFogFactor * 0.85) * uOpacity;

  gl_FragColor = vec4(color, alpha);
}

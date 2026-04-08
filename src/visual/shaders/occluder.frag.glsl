// Occluder fragment shader — outputs any color since colorWrite:false prevents pixel output
void main() {
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}

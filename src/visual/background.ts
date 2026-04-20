import * as THREE from 'three';

const vertexShader = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.9999, 1.0);
}
`;

const fragmentShader = `
varying vec2 vUv;
uniform float uBassEnergy;
void main() {
  float dist = length(vUv - 0.5) * 2.0;
  float warmth = uBassEnergy * 0.02;
  vec3 center = vec3(0.008, 0.008, 0.025);
  vec3 edge = vec3(0.025 + warmth, 0.015, 0.05);
  vec3 color = mix(center, edge, dist * 0.5);
  gl_FragColor = vec4(color, 1.0);
}
`;

export function createBackground(): { mesh: THREE.Mesh; update(bassEnergy: number): void } {
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: { uBassEnergy: { value: 0 } },
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  return {
    mesh,
    update(bassEnergy: number) {
      material.uniforms.uBassEnergy.value = bassEnergy;
    },
  };
}

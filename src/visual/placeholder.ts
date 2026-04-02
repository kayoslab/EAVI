import * as THREE from 'three';

export function addPlaceholder(scene: THREE.Scene): { mesh: THREE.Mesh; ambient: THREE.AmbientLight; directional: THREE.DirectionalLight } {
  const geometry = new THREE.IcosahedronGeometry(1.2, 1);
  const material = new THREE.MeshStandardMaterial({
    color: 0x444466,
    wireframe: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const ambient = new THREE.AmbientLight(0xffffff, 0.3);
  scene.add(ambient);

  const directional = new THREE.DirectionalLight(0xffffff, 0.7);
  directional.position.set(2, 3, 4);
  scene.add(directional);

  return { mesh, ambient, directional };
}

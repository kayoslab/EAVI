import { vi } from 'vitest';
import * as THREE from 'three';

export function createMockRenderer(): THREE.WebGLRenderer {
  const canvas = document.createElement('canvas');
  let width = 0;
  let height = 0;

  const renderer = {
    domElement: canvas,
    setSize: vi.fn((w: number, h: number) => {
      width = w;
      height = h;
      canvas.width = w * Math.min(window.devicePixelRatio, 2);
      canvas.height = h * Math.min(window.devicePixelRatio, 2);
    }),
    setPixelRatio: vi.fn(),
    setClearColor: vi.fn(),
    getClearColor: vi.fn((target: THREE.Color) => {
      target.setRGB(0, 0, 0);
      return target;
    }),
    render: vi.fn(),
    getSize: vi.fn((target: THREE.Vector2) => {
      target.set(width, height);
      return target;
    }),
    dispose: vi.fn(),
  } as unknown as THREE.WebGLRenderer;

  return renderer;
}

export function createMockScene(): THREE.Scene {
  return new THREE.Scene();
}

export function createMockCamera(aspect = 16 / 9): THREE.PerspectiveCamera {
  const camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
  return camera;
}

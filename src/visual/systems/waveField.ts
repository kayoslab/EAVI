import * as THREE from 'three';
import type { Scene } from 'three';
import { createPRNG } from '../prng';
import type { VisualParams } from '../mappings';
import type { FrameState, GeometrySystem } from '../types';

const DEFAULT_MAX_WAVES = 20;
const VERTICES_PER_WAVE = 128;

export interface WaveFieldConfig {
  maxWaves?: number;
  enableShimmer?: boolean;
}

interface Wave {
  y: number;
  amplitude: number;
  frequency: number;
  phase: number;
  hueOffset: number;
}

export interface WaveField extends GeometrySystem {
  readonly waves: Wave[];
  cleanup(): void;
}

export function createWaveField(config?: WaveFieldConfig): WaveField {
  const maxWaves = config?.maxWaves ?? DEFAULT_MAX_WAVES;
  const enableShimmer = config?.enableShimmer ?? true;
  let waves: Wave[] = [];

  let group: THREE.Group | null = null;
  let waveGeometries: THREE.BufferGeometry[] = [];
  let waveMaterials: THREE.LineBasicMaterial[] = [];
  let sceneRef: Scene | null = null;

  return {
    get waves() {
      return waves;
    },

    init(
      scene: Scene,
      seed: string,
      params: VisualParams,
    ): void {
      const rng = createPRNG(seed);
      const baseCount = Math.floor(params.density * maxWaves);
      const effectiveCount = Math.max(1, Math.min(baseCount, maxWaves));
      waves = [];

      for (let i = 0; i < effectiveCount; i++) {
        waves.push({
          y: (i + 0.5) / effectiveCount,
          amplitude: 0.02 + rng() * 0.06,
          frequency: 1 + rng() * 3,
          phase: rng() * Math.PI * 2,
          hueOffset: (rng() - 0.5) * 40,
        });
      }

      // Create Three.js Group with Line objects
      group = new THREE.Group();
      waveGeometries = [];
      waveMaterials = [];

      for (let w = 0; w < effectiveCount; w++) {
        const wave = waves[w];
        const geo = new THREE.BufferGeometry();
        const positions = new Float32Array(VERTICES_PER_WAVE * 3);

        // Initialize vertex positions
        for (let v = 0; v < VERTICES_PER_WAVE; v++) {
          const t = v / (VERTICES_PER_WAVE - 1);
          positions[v * 3] = (t - 0.5) * 8; // x spans [-4, 4]
          positions[v * 3 + 1] = (wave.y - 0.5) * 6; // y from wave position
          positions[v * 3 + 2] = 0;
        }

        geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

        // Color from paletteHue + wave hueOffset
        const hue = ((params.paletteHue + wave.hueOffset) % 360 + 360) % 360;
        const color = new THREE.Color();
        color.setHSL(hue / 360, params.paletteSaturation, 0.5);

        const mat = new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.7,
        });

        const line = new THREE.Line(geo, mat);
        group.add(line);
        waveGeometries.push(geo);
        waveMaterials.push(mat);
      }

      scene.add(group);
      sceneRef = scene;
    },

    draw(_scene: Scene, frame: FrameState): void {
      if (!group || waveGeometries.length === 0) return;

      const { bassEnergy, trebleEnergy, pointerDisturbance, motionAmplitude, cadence } = frame.params;
      const elapsed = frame.elapsed ?? 0;
      const pointerX = frame.pointerX ?? 0.5;
      const pointerY = frame.pointerY ?? 0.5;

      for (let w = 0; w < waves.length; w++) {
        const wave = waves[w];
        const geo = waveGeometries[w];
        const posAttr = geo.getAttribute('position') as THREE.BufferAttribute;
        const positions = posAttr.array as Float32Array;

        const baseAmplitude = wave.amplitude * motionAmplitude;
        const bassAmplitude = bassEnergy * motionAmplitude * 0.3;
        const totalAmplitude = baseAmplitude + bassAmplitude;

        for (let v = 0; v < VERTICES_PER_WAVE; v++) {
          const t = v / (VERTICES_PER_WAVE - 1);
          const x = (t - 0.5) * 8;

          // Base sine wave
          let y = (wave.y - 0.5) * 6;
          y += Math.sin(wave.frequency * x + wave.phase + elapsed * 0.001 * cadence) * totalAmplitude;

          // Treble shimmer — higher frequency overlay
          if (enableShimmer && trebleEnergy > 0) {
            y += Math.sin(wave.frequency * 3 * x + elapsed * 0.003) * trebleEnergy * motionAmplitude * 0.02;
          }

          // Pointer disturbance
          if (pointerDisturbance > 0) {
            const dx = t - pointerX;
            const dy = wave.y - pointerY;
            const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
            const influence = Math.max(0, 1 - dist * 2) * pointerDisturbance * motionAmplitude * 0.15;
            y += Math.sin(elapsed * 0.005 + v * 0.3) * influence;
          }

          positions[v * 3 + 1] = y;
        }

        posAttr.needsUpdate = true;

        // Shimmer: modulate opacity by treble
        if (enableShimmer && trebleEnergy > 0) {
          waveMaterials[w].opacity = 0.5 + trebleEnergy * 0.4;
        }
      }
    },

    cleanup(): void {
      if (group && sceneRef) {
        sceneRef.remove(group);
      }
      for (const geo of waveGeometries) {
        geo.dispose();
      }
      for (const mat of waveMaterials) {
        mat.dispose();
      }
      group = null;
      waveGeometries = [];
      waveMaterials = [];
      sceneRef = null;
    },
  };
}

export function getWaveCount(field: WaveField): number {
  return field.waves.length;
}

export function getWavePositions(
  field: WaveField,
): Array<{ y: number; amplitude: number; frequency: number; phase: number }> {
  return field.waves.map((w) => ({
    y: w.y,
    amplitude: w.amplitude,
    frequency: w.frequency,
    phase: w.phase,
  }));
}

import {
  orbitRig, rigPose, perspective, viewMatrices,
  type Lens, type Pose, type CameraMatrices,
} from 'vgpu/scene';
import { createPRNG } from '../visual/prng';

export interface CameraState {
  readonly view: Float32Array;
  readonly projection: Float32Array;
  readonly viewProjection: Float32Array;
  readonly position: Float32Array;
  readonly lens: Lens;
}

export interface Camera {
  readonly state: CameraState;
  setViewport(width: number, height: number): void;
  /** Advance the autonomous rig. No audio influence: only visuals react to music. */
  update(timeSec: number, motionAmplitude: number): void;
  /** Slow eased yaw/pitch turn over `seconds`; never an instant jump. */
  turn(yawDelta: number, seconds: number, pitchDelta?: number): void;
  /** Ease the distance toward `multiplier` and back to normal over `seconds`. */
  impulseDistance(multiplier: number, seconds: number): void;
}

const LANDSCAPE_FOV = 60;
const PORTRAIT_FOV = 75;

/** Seeded autonomous orbit: slow yaw drift, pitch and distance breathing on incommensurate periods. */
export function createCamera(seed: string, options?: { distance?: number }): Camera {
  const rng = createPRNG(seed + ':camera');
  const baseDistance = options?.distance ?? 4.2;
  const rig = orbitRig({ yaw: rng() * Math.PI * 2, pitch: 0.2, distance: baseDistance });
  const yaw0 = rig.yaw;
  const yawSpeed = (0.025 + rng() * 0.035) * (rng() < 0.5 ? -1 : 1);
  const pitchAmp = 0.15 + rng() * 0.25;
  const pitchFreq = (2 * Math.PI) / (37 + rng() * 40);
  const pitchPhase = rng() * Math.PI * 2;
  const distAmp = baseDistance * (0.08 + rng() * 0.1);
  const distFreq = (2 * Math.PI) / (53 + rng() * 60);
  const distPhase = rng() * Math.PI * 2;

  const lens: Lens = { fov: LANDSCAPE_FOV, near: 0.1, far: 80 };
  const pose: Pose = { position: new Float32Array(3), quaternion: new Float32Array(4) };
  const projection = new Float32Array(16);
  const matrices: CameraMatrices = { view: new Float32Array(16), viewProjection: new Float32Array(16) };
  let aspect = 1;
  let yawOffset = 0;
  let pitchOffset = 0;
  let yawFrom = 0;
  let yawTo = 0;
  let pitchFrom = 0;
  let pitchTo = 0;
  let turnElapsed = 0;
  let turnTotal = 0;
  let distanceMul = 1;
  let distanceEase = 0; // seconds remaining
  let distanceEaseTotal = 0;
  let distanceMulTarget = 1;
  let lastTime = 0;

  function updateProjection(): void {
    perspective(lens, aspect, projection);
  }
  updateProjection();
  rigPose(rig, pose);
  viewMatrices(pose, projection, matrices);

  return {
    state: {
      view: matrices.view,
      projection,
      viewProjection: matrices.viewProjection,
      position: pose.position,
      lens,
    },
    setViewport(width, height) {
      aspect = Math.max(0.1, width / Math.max(1, height));
      lens.fov = height > width * 1.2 ? PORTRAIT_FOV : LANDSCAPE_FOV;
      updateProjection();
      viewMatrices(pose, projection, matrices);
    },
    update(timeSec, motionAmplitude) {
      const ma = Math.max(0, Math.min(1, motionAmplitude));
      const dt = Math.max(0, Math.min(0.1, timeSec - lastTime));
      lastTime = timeSec;
      if (distanceEase > 0) {
        distanceEase = Math.max(0, distanceEase - dt);
        // Bell: ease out to the multiplier and back to 1 over the whole duration.
        const u = distanceEaseTotal > 0 ? 1 - distanceEase / distanceEaseTotal : 1;
        const bell = Math.sin(Math.max(0, Math.min(1, u)) * Math.PI);
        distanceMul = 1 + (distanceMulTarget - 1) * bell;
      }
      if (turnTotal > 0 && turnElapsed < turnTotal) {
        turnElapsed = Math.min(turnTotal, turnElapsed + dt);
        const u = turnElapsed / turnTotal;
        const e = u * u * (3 - 2 * u);
        yawOffset = yawFrom + (yawTo - yawFrom) * e;
        pitchOffset = pitchFrom + (pitchTo - pitchFrom) * e;
      }
      rig.yaw = yaw0 + yawOffset + yawSpeed * timeSec * (0.25 + 0.75 * ma);
      const pitch = 0.2 + pitchOffset + pitchAmp * ma * Math.sin(timeSec * pitchFreq + pitchPhase);
      rig.pitch = Math.max(-1.3, Math.min(1.3, pitch));
      const dist = baseDistance + distAmp * ma * Math.sin(timeSec * distFreq + distPhase);
      rig.distance = Math.max(0.5, dist * distanceMul);
      rigPose(rig, pose);
      viewMatrices(pose, projection, matrices);
    },
    turn(yawDelta, seconds, pitchDelta = 0) {
      yawFrom = yawOffset;
      yawTo = yawOffset + yawDelta;
      pitchFrom = pitchOffset;
      pitchTo = Math.max(-0.9, Math.min(0.9, pitchOffset + pitchDelta));
      turnElapsed = 0;
      turnTotal = Math.max(0.5, seconds);
    },
    impulseDistance(multiplier, seconds) {
      distanceMulTarget = Math.max(0.5, Math.min(1.6, multiplier));
      distanceEase = Math.max(1, seconds);
      distanceEaseTotal = distanceEase;
    },
  };
}

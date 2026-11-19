import type { PartId } from '../content/copy'

/**
 * Per-frame output of the Director: the resolved state of the product and the studio.
 * Written once per frame (priority -1), read by the model, studio and effects in the same frame.
 */
export const stage = {
  /** Product yaw incl. drag and turntable (rad). */
  rotY: 0,
  /** Crank angle relative to the body (rad). */
  crank: 0,
  /** Crank angular velocity (rad/s), for flow and rpm. */
  crankVel: 0,
  explode: 0,
  /** X-ray section plane (world cm; < 0 = solid) and its edge-line strength. */
  sweep: -10,
  edge: 0,
  /** Dial rotation (rad) and the burr drop it causes (cm). */
  dial: 0,
  gap: 0,
  /** Grounds: flow 0..1 and grams in the cup. */
  flow: 0,
  heap: 0,
  /** Per-part presence: 1 normal, < 1 dimmed, > 1 emphasised. */
  presence: { crank: 1, knob: 1, shaft: 1, bearing: 1, body: 1, dial: 1, burr: 1, cup: 1 } as Record<PartId, number>,
  /** Accent light aimed at a part (world position) and its strength. */
  accent: { x: 0, y: 10, z: 0, power: 0 },
  /** Studio. */
  envRot: 0,
  env: 1,
  key: 1,
  halo: 1,
  /** 0 → 1 as the studio lights come up after load. */
  intro: 0,
}

/**
 * Motion primitives.
 *
 * Two kinds of follow behaviour are used throughout:
 *  - `damp`: first-order exponential smoothing. Starts moving instantly, settles softly.
 *    Good for things that should feel responsive (pointer parallax, UI numbers).
 *  - `Spring`: critically damped second-order spring. Accelerates *and* decelerates,
 *    so it reads as having mass. Used for the camera and the product itself.
 * Both are frame-rate independent.
 */

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a))
export const smoothstep = (a: number, b: number, v: number) => {
  const t = invLerp(a, b, v)
  return t * t * (3 - 2 * t)
}

/** Exponential damping. `lambda` ≈ 1 / time-constant (s). */
export function damp(current: number, target: number, lambda: number, dt: number) {
  return lerp(current, target, 1 - Math.exp(-lambda * dt))
}

/** Easing curves — each motion picks the one that suits its weight. */
export const ease = {
  /** Camera between story beats: slow out of rest, long settle. */
  camera: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  /** Mechanical parts: firm start, soft landing. */
  part: (t: number) => 1 - Math.pow(1 - t, 3.2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutSine: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
}

/**
 * Critically damped spring, integrated implicitly so it stays stable at any dt.
 * `omega` is the natural frequency (rad/s): ~2 is heavy and cinematic, ~10 is snappy.
 */
export class Spring {
  value: number
  velocity = 0
  constructor(value = 0, public omega = 4) {
    this.value = value
  }
  step(target: number, dt: number, omega = this.omega) {
    const f = 1 + 2 * dt * omega
    const oo = omega * omega
    const hoo = dt * oo
    const hhoo = dt * hoo
    const detInv = 1 / (f + hhoo)
    const detX = f * this.value + dt * this.velocity + hhoo * target
    const detV = this.velocity + hoo * (target - this.value)
    this.value = detX * detInv
    this.velocity = detV * detInv
    return this.value
  }
  snap(v: number) {
    this.value = v
    this.velocity = 0
  }
}

/** Shortest signed angular difference, for interpolating rotations. */
export function angleDelta(a: number, b: number) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

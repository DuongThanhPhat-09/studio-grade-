import { clamp, ease, invLerp, lerp } from './motion'
import { beats, type BeatId } from '../content/copy'

/**
 * Camera & lighting choreography.
 *
 * Each beat is a "shot", described the way a photographer would set one up:
 * where the lens points, from which angle, at what focal length, and how the
 * frame is composed (lens shift — the product is placed off-centre by shifting
 * the lens, not by tilting the camera, so verticals stay vertical).
 *
 * Between shots the camera holds while copy or controls are on screen, then
 * travels. A shot may "drift" a few values across its hold, driven by scroll.
 */

export interface Shot {
  /** Look-at point, cm. Product axis at x = z = 0, floor at y = 0. */
  target: [number, number, number]
  /** Orbit angles in degrees; az 0 = camera on +Z, positive = to the right. */
  az: number
  el: number
  dist: number
  /** Vertical field of view (deg). 9–24: long lens, product-photo perspective. */
  fov: number
  /** Lens shift in NDC: where the target lands on screen. */
  shiftX: number
  shiftY: number
  /** Product yaw and crank angle (relative to body), degrees. */
  rotY: number
  crank: number
  explode: number
  /** X-ray: 0 solid, 1 ghosted below `sweep` (world cm). sweep ≥ 25 = whole body. */
  xray: number
  sweep: number
  /** Studio: environment yaw (deg), environment intensity, key light, backdrop halo. */
  envRot: number
  env: number
  key: number
  halo: number
  /** Fraction of the beat at which the camera starts travelling to the next one. */
  leave: number
  drift?: Partial<Pick<Shot, 'az' | 'envRot' | 'rotY' | 'dist' | 'el' | 'crank'>>
}

type NumKey = Exclude<keyof Shot, 'target' | 'drift'>
export const NUM_KEYS: NumKey[] = [
  'az', 'el', 'dist', 'fov', 'shiftX', 'shiftY', 'rotY', 'crank', 'explode', 'xray', 'sweep',
  'envRot', 'env', 'key', 'halo', 'leave',
]

const base = { leave: 0.42, env: 1, key: 1, halo: 1, explode: 0, xray: 0, sweep: 40 }
type ShotInput = Omit<Shot, keyof typeof base> & Partial<typeof base>
const shot = (s: ShotInput): Shot => ({ ...base, ...s })

/** A full product in the right half of a landscape frame. */
const hero = { target: [1.6, 10.0, 0] as [number, number, number], az: 16, el: 6, dist: 80, fov: 20, shiftX: 0.22, shiftY: -0.02 }

export const desktop: Record<BeatId, Shot> = {
  // Chapter 1 — the film.
  // Tight on the crank and dial; the body falls away into shadow.
  intro: shot({
    target: [1.6, 15.2, 0], az: -14, el: 6, dist: 40, fov: 20, shiftX: 0.3, shiftY: -0.04,
    rotY: -30, crank: 28, envRot: -24, env: 0.8, key: 0.75, halo: 0.55, drift: { az: -9 },
  }),
  // Macro i — the bead-blasted band and its etched mark; a softbox slides across.
  mAlu: shot({
    target: [0, 13.35, 0], az: -8, el: 4, dist: 26, fov: 9, shiftX: 0.27, shiftY: 0,
    rotY: -8, crank: 98, envRot: -70, env: 1.05, key: 0.55, halo: 0.5, leave: 0.5,
    drift: { envRot: 40 },
  }),
  // Macro ii — knurl. The mark turns away so the crop runs through plain metal only.
  mKnurl: shot({
    target: [0, 11.15, 0], az: -10, el: 2, dist: 25, fov: 13, shiftX: 0.25, shiftY: 0,
    rotY: -135, crank: 227, envRot: -40, env: 1.1, key: 0.65, halo: 0.6, leave: 0.5,
    drift: { envRot: 50, az: -5 },
  }),
  // Macro iii — the arm from above: anisotropic brushing reads as a long streak.
  mCrank: shot({
    target: [3.5, 15.7, 0], az: -18, el: 17, dist: 31, fov: 13, shiftX: 0.2, shiftY: -0.04,
    rotY: 0, crank: 0, envRot: -20, env: 1, key: 0.8, halo: 0.5, leave: 0.5,
    drift: { envRot: 25, az: -12 },
  }),
  // Macro iv — the camera follows the arm out to the knob.
  mWalnut: shot({
    target: [6.6, 17.25, 0], az: -24, el: 6, dist: 23, fov: 12, shiftX: 0.22, shiftY: 0,
    rotY: 0, crank: 0, envRot: -10, env: 0.95, key: 1, halo: 0.55, leave: 0.5,
    drift: { az: -14, envRot: 20 },
  }),
  // Macro v — a section plane through the lower body reveals the coated burr.
  mBurr: shot({
    target: [0, 7.1, 0], az: 14, el: 6, dist: 30, fov: 14, shiftX: 0.22, shiftY: 0,
    rotY: -6, crank: 60, xray: 1, sweep: 8.8, envRot: 0, env: 1, key: 1, halo: 0.6, leave: 0.5,
    drift: { az: 22 },
  }),
  // Full reveal: the object standing in its own light.
  form: shot({
    target: [1.8, 9.4, 0], az: 22, el: 7, dist: 76, fov: 20, shiftX: 0.24, shiftY: -0.02,
    rotY: -6, crank: 24, envRot: 0, drift: { az: 30 },
  }),

  // Chapter 2 — exploded along its axis.
  engineering: shot({
    target: [1.0, 14.4, 0], az: 24, el: 9, dist: 110, fov: 20, shiftX: 0.1, shiftY: -0.04,
    rotY: 0, crank: 180, explode: 1, envRot: 10, key: 0.9, halo: 1.15, leave: 0.56,
    drift: { az: 30 },
  }),

  // Chapter 3 — X-ray: the shell ghosts, the drivetrain shows.
  xray: shot({
    target: [1.4, 10.8, 0], az: -22, el: 14, dist: 82, fov: 20, shiftX: 0.22, shiftY: -0.03,
    rotY: 0, crank: 200, xray: 1, sweep: 40, envRot: -12, env: 0.9, key: 1.1, halo: 0.9, leave: 0.74,
  }),

  // Chapter 4 — grind simulator: hopper, burr and cup all visible through the shell.
  grind: shot({
    target: [1.0, 10.2, 0], az: 18, el: 10, dist: 76, fov: 20, shiftX: 0.22, shiftY: -0.03,
    rotY: -10, crank: 30, xray: 1, sweep: 40, envRot: 6, env: 0.9, key: 1.1, halo: 0.95, leave: 0.72,
  }),

  // Chapter 5 — configurator.
  build: shot({ ...hero, rotY: -8, crank: 26, envRot: 2, leave: 0.72 }),

  // Chapter 6 — Coffee Lab: higher, so the dial reads.
  lab: shot({
    target: [1.4, 10.6, 0], az: -18, el: 13, dist: 80, fov: 20, shiftX: 0.24, shiftY: -0.03,
    rotY: 4, crank: 150, envRot: -8, leave: 0.72,
  }),

  // Chapter 7 — finale. Centred, quiet, iconic.
  final: shot({
    target: [1.6, 10.2, 0], az: 14, el: 6, dist: 76, fov: 19, shiftX: 0, shiftY: 0.1,
    rotY: -14, crank: 148, envRot: 4, halo: 1.05, leave: 1,
  }),
}

/**
 * Portrait: the product lives in the top ~55% of the screen and copy owns the
 * bottom (macros fill the frame and carry a small caption over a scrim).
 */
const mFull = { target: [1.6, 9.8, 0] as [number, number, number], dist: 112, fov: 24, shiftX: 0, shiftY: 0.3 }
export const mobile: Record<BeatId, Shot> = {
  intro: { ...desktop.intro, ...mFull, dist: 104, drift: { az: -4 } },
  mAlu: { ...desktop.mAlu, dist: 44, fov: 18, shiftX: 0, shiftY: 0.18 },
  mKnurl: { ...desktop.mKnurl, dist: 44, fov: 18, shiftX: 0, shiftY: 0.18 },
  mCrank: { ...desktop.mCrank, target: [3.3, 16.0, 0], dist: 64, fov: 18, shiftX: 0, shiftY: 0.3 },
  mWalnut: { ...desktop.mWalnut, dist: 40, fov: 18, shiftX: 0, shiftY: 0.22 },
  mBurr: { ...desktop.mBurr, dist: 46, fov: 20, shiftX: 0, shiftY: 0.22 },
  form: { ...desktop.form, ...mFull, drift: { az: 30 } },
  engineering: { ...desktop.engineering, target: [1.0, 14.8, 0], dist: 178, fov: 24, shiftX: 0, shiftY: 0.4, drift: { az: 30 } },
  xray: { ...desktop.xray, ...mFull, target: [1.4, 10.4, 0], dist: 118, shiftY: 0.36 },
  grind: { ...desktop.grind, ...mFull, dist: 120, shiftY: 0.4 },
  build: { ...desktop.build, ...mFull, dist: 128, shiftY: 0.48 },
  lab: { ...desktop.lab, ...mFull, dist: 142, shiftY: 0.52 },
  final: { ...desktop.final, ...mFull, dist: 122, shiftY: 0.45 },
}

export const desktopShots = beats.map((b) => desktop[b.id])
export const mobileShots = beats.map((b) => mobile[b.id])

/** Hold window starts this far before a beat's integer position. */
const ARRIVE = -0.06
/** Travel to the next beat finishes at this fraction. */
const ARRIVED = 0.94

function evalShot(s: Shot, local: number, out: Shot) {
  const d = s.drift ? invLerp(ARRIVE, s.leave, local) : 0
  for (const k of NUM_KEYS) {
    const end = s.drift?.[k as keyof NonNullable<Shot['drift']>]
    out[k] = end === undefined ? s[k] : lerp(s[k], end, ease.inOutSine(d))
  }
  out.target = [s.target[0], s.target[1], s.target[2]]
  return out
}

const tmpA = { ...desktop.intro }
const tmpB = { ...desktop.intro }

/** Sample the choreography at scroll position `s` (beat units). */
export function sampleShots(shots: Shot[], s: number, out: Shot): Shot {
  const last = shots.length - 1
  const k = clamp(Math.floor(s), 0, last)
  const local = s - k
  const a = evalShot(shots[k], local, tmpA)
  if (k === last) {
    for (const key of NUM_KEYS) out[key] = a[key]
    out.target = [...a.target]
    return out
  }
  const b = evalShot(shots[k + 1], local - 1, tmpB)
  const t = ease.camera(invLerp(shots[k].leave, ARRIVED, local))
  for (const key of NUM_KEYS) out[key] = lerp(a[key], b[key], t)
  out.target = [
    lerp(a.target[0], b.target[0], t),
    lerp(a.target[1], b.target[1], t),
    lerp(a.target[2], b.target[2], t),
  ]
  // Parts move first when opening, the lens first when closing.
  const opening = b.explode > a.explode
  const te = opening
    ? ease.inOutSine(invLerp(shots[k].leave - 0.06, ARRIVED - 0.12, local))
    : ease.inOutSine(invLerp(shots[k].leave + 0.06, ARRIVED, local))
  out.explode = lerp(a.explode, b.explode, te)
  // X-ray is a step, not a blend: it switches when the move is half done, and the
  // section plane itself performs the transition.
  out.xray = t < 0.5 ? a.xray : b.xray
  out.sweep = t < 0.5 ? a.sweep : b.sweep
  return out
}

export function createShot(): Shot {
  return { ...desktop.intro, target: [...desktop.intro.target] as [number, number, number] }
}

/** Revolutions turned by scrolling through the X-ray chapter. */
export function turnsForScroll(s: number, xrayBeat: number) {
  return ease.inOutSine(invLerp(xrayBeat - 0.04, xrayBeat + 0.72, s)) * 4
}

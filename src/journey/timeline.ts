import { clamp, smoothstep } from '../animation/motion'

/**
 * INSIDE THE GRIND — timeline.
 *
 * Two clocks:
 *  - `t`  film time in seconds. The camera operator, the lights and the UI live here.
 *  - `τ`  subject time. Everything physical — burr rotation, falling beans, fragments,
 *         grounds — runs on τ, which slows to ~3 % of real time inside the burr and ramps
 *         back to 1 on the way out (a high-speed-camera speed ramp). Because all physics
 *         share τ, the ramp stays consistent: gravity, rotation and fracture slow together.
 *
 * Every visual is a pure function of `t`, so the film can be sought, paused, rendered
 * as stills (reduced motion) and tested frame by frame.
 *
 * Named cues mark moments for sound design: subscribe with `onCue`, or listen for the
 * `orme:cue` DOM event ({ detail: { name, t } }).
 */

export const CUES = {
  lights_down: 0,
  crank_start: 1.6,
  approach: 3.0,
  enter_body: 5.0,
  burr_reveal: 8.6,
  bean_drop: 10.2,
  bean_contact: 13.2,
  bean_fracture: 14.5,
  fragments_split: 15.5,
  particle_follow: 16.8,
  grounds_release: 22.4,
  landing: 25.6,
  scale_reveal: 27.0,
  hero_return: 33.4,
} as const

export type CueName = keyof typeof CUES
export const CUE_ORDER = (Object.keys(CUES) as CueName[]).sort((a, b) => CUES[a] - CUES[b])

/** The title is fully set by here; after it the film idles on the hero frame. */
export const END = 37

/** Real-time crank speed while grinding (rev/s, clockwise from above). */
const CRANK_RPS = 1.05
/** Slowest subject time: 1 s of film = 0.03 s of real time. */
const SLOW = 0.03

/** dτ/dt — the speed ramp. */
export function timeScale(t: number) {
  const into = smoothstep(6.4, 9.6, t) // ramp down as the lens closes in
  const out = smoothstep(25.2, 30.2, t) // ramp up as it pulls back out
  const deep = 1 - 0.3 * smoothstep(12.8, 13.4, t) * (1 - smoothstep(15.2, 16.2, t)) // a touch slower at the fracture
  const slow = SLOW * deep
  return 1 + (slow - 1) * into * (1 - out)
}

/** Crank drive (rev per subject-second): spins up at crank_start, settles on the hero frame. */
function drive(t: number) {
  const on = smoothstep(CUES.crank_start, CUES.crank_start + 1.4, t)
  const off = smoothstep(30.6, 35.6, t)
  return CRANK_RPS * on * (1 - off)
}

/* Precomputed integrals: τ(t) and burr angle θ(t). */
const HZ = 240
const N = Math.ceil((END + 8) * HZ)
const TAU = new Float32Array(N + 1)
const THETA = new Float64Array(N + 1)
;(() => {
  let tau = 0
  let theta = 0
  for (let i = 0; i <= N; i++) {
    TAU[i] = tau
    THETA[i] = theta
    const t = i / HZ
    const ts = timeScale(t + 0.5 / HZ)
    tau += ts / HZ
    theta -= drive(t + 0.5 / HZ) * ts * Math.PI * 2 / HZ
  }
})()

const sample = (arr: ArrayLike<number>, t: number) => {
  const x = clamp(t, 0, END + 7.9) * HZ
  const i = Math.floor(x)
  const f = x - i
  return arr[i] + (arr[i + 1] - arr[i]) * f
}

/** Subject time at film time t. */
export const tau = (t: number) => sample(TAU, t)

/**
 * Burr / crank angle (rad, decreasing = clockwise from above) at film time t.
 * The settle is nudged so the crank comes to rest at a composed angle on the hero frame.
 */
const RAW_END = THETA[N]
let restAngle = 0
let restCorrection = 0
export function setRestAngle(a: number) {
  restAngle = a
  const TAU2 = Math.PI * 2
  // Extra travel in the direction of rotation so it never runs backwards.
  restCorrection = (((RAW_END - restAngle) % TAU2) + TAU2) % TAU2
}
export function theta(t: number) {
  return sample(THETA, t) - restCorrection * smoothstep(30.6, 35.8, t)
}
export const restingTheta = () => restAngle

/* ------------------------------------------------------------------ */
/* Cues                                                                 */
/* ------------------------------------------------------------------ */

type CueListener = (name: CueName, t: number) => void
const cueListeners = new Set<CueListener>()

export function onCue(fn: CueListener) {
  cueListeners.add(fn)
  return () => {
    cueListeners.delete(fn)
  }
}

/** Fire every cue whose time lies in (from, to]. */
export function fireCues(from: number, to: number, log?: CueName[]) {
  for (const name of CUE_ORDER) {
    const c = CUES[name]
    if (c > from && c <= to) {
      log?.push(name)
      cueListeners.forEach((l) => l(name, c))
      window.dispatchEvent(new CustomEvent('orme:cue', { detail: { name, t: c } }))
    }
  }
}

/* ------------------------------------------------------------------ */
/* Reduced motion: the film as a sequence of composed stills            */
/* ------------------------------------------------------------------ */

export const STILLS: { t: number; caption: string }[] = [
  { t: 2.9, caption: 'Orme No. 1, in the dark.' },
  { t: 7.2, caption: 'Through the body.' },
  { t: 12.4, caption: 'One bean meets the burr.' },
  { t: 14.25, caption: 'It cracks along its grain.' },
  { t: 15.9, caption: 'Then it breaks.' },
  { t: 19.6, caption: 'A fragment is cut finer, tooth by tooth.' },
  { t: 24.2, caption: 'It leaves as a single grain.' },
  { t: 26.6, caption: 'One of thousands.' },
  { t: 36, caption: '' },
]
export const STILL_HOLD = 3.6

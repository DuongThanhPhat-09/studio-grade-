import { beats } from '../content/copy'

/**
 * Mutable runtime state shared between the DOM layer and the render loop.
 * Deliberately not React state: it changes every frame and must never trigger renders.
 * React only subscribes to the coarse signals (active beat, ready) via `subscribe`.
 */

type Listener = () => void
const listeners = new Set<Listener>()

export const runtime = {
  /** Scroll position in beat units: 0 = top of intro. */
  scroll: 0,
  /** Pointer in normalised device coords, -1..1 (y up). */
  pointer: { x: 0, y: 0, active: false, fine: true },
  /** Drag: product yaw (x) and camera elevation (y, inspect only), radians. */
  drag: { active: false, x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: 0, releasedAt: 0, moved: 0 },
  /** What a drag on the canvas does right now (set by the Director each frame). */
  dragMode: 'yaw' as 'yaw' | 'orbit' | 'crank' | 'none',
  /** Crank turned by hand in the X-ray chapter (rad, with flywheel inertia); total = revolutions. */
  crankHand: { active: false, angle: 0, velocity: 0, total: 0, lastX: 0, lastT: 0 },
  /** Dial turned by hand in the grind chapter. */
  dialHand: { active: false, startX: 0, startClicks: 0 },
  ready: false,
  introStart: 0,
  reducedMotion: false,
  /** Leaving the film by skipping: the site's camera cuts (under a veil) instead of travelling. */
  snapCamera: false,
  /** Index of the beat whose copy is on screen, or -1 during pure camera moves. */
  activeSection: 0,
  /** Crank revolutions in the drivetrain chapter (scroll + hand). */
  turns: 0,
  explode: 0,
  /** Seconds the finale has been on screen (lighting simplifies over time). */
  finaleTime: 0,
  /** DOM nodes the render loop writes to directly. */
  dom: {
    callouts: new Map<string, HTMLElement>(),
    text: new Map<string, HTMLElement>(),
    bars: new Map<string, HTMLElement>(),
    progress: null as HTMLElement | null,
  },
}

export function emit() {
  listeners.forEach((l) => l())
}

export function subscribe(l: Listener) {
  listeners.add(l)
  return () => {
    listeners.delete(l)
  }
}

/** Which beat's copy is visible at scroll position s (each beat sets its own window). */
export function sectionForScroll(s: number): number {
  const nearest = Math.round(s)
  for (let k = Math.max(0, nearest - 1); k <= Math.min(beats.length - 1, nearest + 1); k++) {
    const [before, after] = beats[k].text
    if (s >= k - before && s <= k + after) return k
  }
  return -1
}

/** Write text into a registered node only when it changed. */
export function writeText(key: string, value: string) {
  const el = runtime.dom.text.get(key)
  if (el && el.textContent !== value) el.textContent = value
}

export function writeBar(key: string, v: number) {
  const el = runtime.dom.bars.get(key)
  if (el) el.style.transform = `scaleX(${Math.min(1, Math.max(0, v)).toFixed(4)})`
}

/** Ref callback factory: registers an element under a key for loop writes. */
export const domText = (key: string) => (el: HTMLElement | null) => {
  if (el) runtime.dom.text.set(key, el)
  else runtime.dom.text.delete(key)
}
export const domBar = (key: string) => (el: HTMLElement | null) => {
  if (el) runtime.dom.bars.set(key, el)
  else runtime.dom.bars.delete(key)
}

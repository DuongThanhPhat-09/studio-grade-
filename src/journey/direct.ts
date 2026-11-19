import * as THREE from 'three'
import { clamp, smoothstep } from '../animation/motion'
import { stage } from '../scene/stage'
import { sim } from '../scene/grindSim'
import { emit } from '../state/runtime'
import { CUES, END, fireCues, setRestAngle, STILL_HOLD, STILLS, tau, theta } from './timeline'
import { journey, jf } from './state'
import { buildCamera, blendLens, lens, lensPosition, track, type Lens } from './camera'
import { cluster, heroBean, plan, pose, setGap, solvePlan, subject } from './paths'

/**
 * Per-frame resolution of the film: time, cues, lens, lights, X-ray shell, section
 * plane, focus. Called by the Director in place of the scroll choreography.
 */

const DEG = Math.PI / 180

export interface Entry extends Lens {
  env: number
  key: number
  halo: number
  envRot: number
  sweep: number
  crank: number
  rotY: number
  heap: number
}

let cam: ReturnType<typeof buildCamera> | null = null
let camPortrait = false
let entry: Entry | null = null
let studio: Record<'env' | 'key' | 'halo' | 'envRot' | 'sweep' | 'shell' | 'grams' | 'cut', (t: number) => number> | null = null
const L = lens()
const E = lens()
const tmp = new THREE.Vector3()
const tmp2 = new THREE.Vector3()
const sp = pose()
let lastCrank = 0

/** Begin a run from wherever the site was. */
export function startJourney(e: Entry, portrait: boolean, reduced: boolean, gap: number) {
  entry = e
  setGap(gap)
  // Composition: approach from the front-right; the crank comes to rest pointing back-right.
  solvePlan(38, 14)
  cam = buildCamera(portrait)
  camPortrait = portrait
  setRestAngle(((cam.AH + 32) * DEG) - Math.PI / 2 - e.crank)
  studio = {
    env: track([[0, e.env], [1.0, 0.03], [1.6, 0.03], [3.0, 0.42], [6, 0.82], [10, 0.42], [16.5, 0.34], [24, 0.34], [27, 0.45], [31, 1.0], [END, 1.0]]),
    key: track([[0, e.key], [1.0, 0], [2.0, 0], [3.6, 0.55], [7, 0.85], [10, 0.62], [27, 0.62], [31, 1.12], [END, 1.12]]),
    halo: track([[0, e.halo], [1.0, 0.04], [2.4, 0.45], [6, 0.75], [10, 0.22], [27, 0.22], [31, 1.05], [END, 1.2]]),
    // Offset from the base yaw: at 1.3 rad the rim strips face the lens (the intro's trick).
    envRot: track([[0, 0], [1.0, 1.3], [3.0, 1.1], [7.5, 0.1], [27, 0.1], [33, -0.15], [END, -0.2]]),
    sweep: track([[0, e.sweep], [1.2, -2], [5.0, -2], [7.6, 22], [30.4, 22], [32.9, -2]]),
    shell: track([[0, 1], [8.2, 1], [10.0, 0], [28.0, 0], [29.8, 1]]),
    grams: track([[0, Math.max(6, e.heap)], [22, 14]]),
    cut: track([[16.0, 0], [18.2, 1], [22.5, 1], [23.6, 0]]),
  }
  journey.t = 0
  journey.speed = journey.speed || 1
  journey.paused = false
  journey.stills = reduced
  journey.still = 0
  journey.stillSince = performance.now()
  journey.pendingStill = false
  journey.snapshot = null
  journey.phase = 'play'
  journey.fired = []
  journey.runs++
  lastCrank = e.crank
  fireCues(-1, 0, journey.fired)
  emit()
}

export function endJourney() {
  journey.phase = 'off'
  emit()
  jf.active = false
  jf.fine = false
  jf.macro = 0
  // Hand the hopper back to the grind simulator.
  sim.beans = 0
  sim.load = 0
  sim.progress = 0
}

/** Seek (dev, tests, stills). Cues in between fire as passed. */
export function seek(t: number) {
  const from = journey.t
  journey.t = clamp(t, 0, END + 30)
  if (journey.t > from) fireCues(from, journey.t, journey.fired)
}

/**
 * Advance and resolve. Returns the lens the Director should apply this frame.
 */
export function stepJourney(dt: number, portrait: boolean, now: number): Lens {
  if (!cam || !studio || !entry) throw new Error('journey not started')
  if (portrait !== camPortrait) {
    cam = buildCamera(portrait)
    camPortrait = portrait
  }

  // ── Clock ──────────────────────────────────────────────────────────
  const prev = journey.t
  if (journey.stills) {
    // Reduced motion: composed stills, each held, then a crossfade to the next.
    // The outgoing frame is captured after it is presented; the next still is revealed
    // beneath it as the capture fades.
    const i = journey.still
    if (!journey.pendingStill && now - journey.stillSince > STILL_HOLD * 1000 && i < STILLS.length - 1) {
      journey.pendingStill = true
      journey.snapshot = (url) => {
        if (url) journey.crossfade?.(url)
        journey.still = Math.min(journey.still + 1, STILLS.length - 1)
        journey.stillSince = performance.now()
        journey.pendingStill = false
        emit()
      }
    }
    journey.t = STILLS[journey.still].t
  } else if (!journey.paused) {
    journey.t += dt * journey.speed
  }
  if (journey.t > prev) fireCues(prev, journey.t, journey.fired)
  const t = journey.t
  if (t >= CUES.hero_return && journey.phase === 'play') {
    journey.phase = 'hero'
    emit()
  }

  // ── Lens ───────────────────────────────────────────────────────────
  cam.at(t, L)
  // Entry: from the site's camera into the film's first frame, under the lights going down.
  const k = smoothstep(0, 1.5, t)
  const lensOut = k < 1 ? blendLens(entry, L, k * k * (3 - 2 * k), E) : L
  const camPos = lensPosition(lensOut, tmp)

  // ── Subject & focus ───────────────────────────────────────────────
  const T = lensOut.target
  jf.active = true
  jf.t = t
  jf.tau = tau(t)
  jf.theta = theta(t)
  jf.target = [T.x, T.y, T.z]
  jf.cam = [camPos.x, camPos.y, camPos.z]
  jf.dist = lensOut.dist
  const focusP = focusSubject(t, tmp2).lerp(T, 0.35)
  jf.subject = [focusP.x, focusP.y, focusP.z]
  jf.focus = camPos.distanceTo(focusP)
  const m = 1 - smoothstep(3.5, 9, lensOut.dist)
  jf.macro = m
  jf.focusRange = Math.max(0.04, jf.focus * 0.28)
  jf.bokeh = m
  jf.fine = lensOut.dist < 7.5
  jf.detail = 1 - smoothstep(3.2, 6.2, lensOut.dist)
  jf.pile = 1 - smoothstep(9.0, 10.4, t) * (1 - smoothstep(28.0, 29.5, t))

  // Cutaway of the stationary ring: a wedge opens around the line of sight to the particle.
  const cutAmt = studio.cut(t)
  jf.cut.half = cutAmt * 0.36
  jf.cut.edge = cutAmt * (1 - smoothstep(0.85, 1, cutAmt) * 0.6)
  if (cutAmt > 0) {
    subject(t, sp)
    // Where the sight line crosses the ring.
    tmp2.copy(camPos).sub(sp.p)
    const k = 0.3 / Math.max(0.05, Math.hypot(tmp2.x, tmp2.z))
    jf.cut.center = Math.atan2(sp.p.x + tmp2.x * k, sp.p.z + tmp2.z * k)
  }

  // ── Shell ──────────────────────────────────────────────────────────
  jf.shellAlpha = studio.shell(t)
  jf.cupAlpha = 1
  jf.near = [lensOut.dist * 0.12, lensOut.dist * 0.5]
  jf.probe = m
  jf.rim = m

  // ── Product & studio → stage ───────────────────────────────────────
  stage.rotY = entry.rotY * (1 - smoothstep(0, 1.2, t))
  const crank = jf.theta + entry.crank
  stage.crankVel = (crank - lastCrank) / Math.max(dt, 1e-3)
  lastCrank = crank
  stage.crank = crank
  stage.explode = 0
  const sw = studio.sweep(t)
  const swV = Math.abs(studio.sweep(t + 0.05) - sw) / 0.05
  stage.sweep = sw
  stage.edge = t < 1.6 ? 0 : clamp(swV / 4) * 0.9
  stage.envRot = entry.envRot + studio.envRot(t)
  stage.env = studio.env(t)
  stage.key = studio.key(t)
  stage.halo = studio.halo(t)
  stage.intro = 1
  stage.accent.power = 0
  for (const p in stage.presence) stage.presence[p as keyof typeof stage.presence] = 1
  // Grinding: the stream into the cup is drawn as points only where they stay small.
  const running = smoothstep(CUES.crank_start, CUES.crank_start + 1.4, t) * (1 - smoothstep(30.6, 34.5, t))
  stage.flow = running * smoothstep(16, 26, lensOut.dist)
  stage.heap = studio.grams(t)
  // The hopper keeps its beans for the whole film.
  sim.beans = 1
  sim.load = 1
  sim.progress = 0
  return lensOut
}

const fb = pose()
/** What is in focus: the same chain as the look-at, without the operator's lead. */
function focusSubject(t: number, out: THREE.Vector3) {
  if (t < 10.3) return out.copy(plan.lip)
  if (t < CUES.bean_fracture) return out.copy(heroBean(t, fb).p)
  if (t < 16.6) return cluster(t, out)
  if (t < 26.0) return out.copy(subject(t, fb).p)
  return out.copy(plan.land)
}

/** Stills mode: index of the still on screen. */
export const stillIndex = () => journey.still

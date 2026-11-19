import * as THREE from 'three'
import { clamp, smoothstep } from '../animation/motion'
import { DIM } from '../models/parts'
import { CUES, tau, theta } from './timeline'
import { getFracture, rng } from './fracture'

/**
 * Art-directed trajectories, all pure functions of film time.
 *
 * Nothing here is simulated. Motion is written in the burr's own terms — carried round
 * by the rotating cone (with a little slip), sinking down the narrowing gap, confined
 * between the cone and the stationary ring — and timed in subject time τ, so gravity,
 * rotation and separation slow down together in the speed ramp.
 */

const G = 981 // cm/s², real gravity in subject time
const TWO_PI = Math.PI * 2
const UP = new THREE.Vector3(0, 1, 0)

/* ------------------------------------------------------------------ */
/* The burr in world terms (grinder yaw is 0 during the film)          */
/* ------------------------------------------------------------------ */

/** Drop of the cone set by the dial (cm), captured when the film starts. */
let gap = 0
export const setGap = (g: number) => (gap = g)
export const getGap = () => gap

const coneBottom = () => DIM.innerBurrY - gap
/** Cone radius at the crests (no tooth depth), world height y. */
export function coneR(y: number) {
  const v = clamp((y - coneBottom()) / 2.3)
  const base = 2.05 - 1.08 * Math.pow(v, 1.12)
  return base - 0.0375 * (1 - smoothstep(0.55, 0.95, v))
}
/** Mean inner radius of the stationary ring. */
export function ringR(y: number) {
  const v = clamp((y - DIM.outerBurrY) / 1.45)
  return 2.12 + 0.06 * v + 0.035
}
export const RING_TOP = DIM.outerBurrY + 1.45
export const RING_BOTTOM = DIM.outerBurrY

/** Keep a body of radius `rad` inside the gap below the ring lip (soft walls). */
function confine(p: THREE.Vector3, rad: number) {
  if (p.y > RING_TOP + rad) return p
  const r = Math.hypot(p.x, p.z)
  const lo = coneR(p.y) + rad * 0.75
  const hi = ringR(p.y) - rad * 0.75
  let rr = r
  if (hi <= lo) rr = (lo + hi) / 2
  else {
    const soft = Math.min(0.05, (hi - lo) * 0.25)
    if (rr < lo + soft) rr = lo + soft * (1 - Math.exp((rr - lo - soft) / soft))
    if (rr > hi - soft) rr = hi - soft * (1 - Math.exp((hi - soft - rr) / soft))
  }
  const k = rr / Math.max(r, 1e-6)
  p.x *= k
  p.z *= k
  return p
}

/** World point at angle φ (x = r sin φ, z = r cos φ). */
export const polar = (phi: number, r: number, y: number, out = new THREE.Vector3()) => out.set(Math.sin(phi) * r, y, Math.cos(phi) * r)
export const angleOf = (p: THREE.Vector3) => Math.atan2(p.x, p.z)
/** Wrap to (-π, π]. */
export const wrapAngle = (a: number) => a - TWO_PI * Math.round(a / TWO_PI)

/* ------------------------------------------------------------------ */
/* Composition constants, solved once per film                          */
/* ------------------------------------------------------------------ */

export const plan = {
  /** World angle of the place on the ring lip where the hero bean is caught. */
  phiL: 0,
  lip: new THREE.Vector3(),
  /** Bean resting pose. */
  rest: new THREE.Vector3(),
  restQ: new THREE.Quaternion(),
  /** Where the followed particle lands on the heap. */
  land: new THREE.Vector3(),
  phiLand: 0,
  /** Grounds heap height (cm at the centre) used for landing. */
  heapH: 0,
  /** Index into fracture.l2 of the followed fragment. */
  subject: 0,
}

/** Heap surface height at radius r (matches Grounds' heap and particle shader). */
export const heapY = (r: number, h = plan.heapH) => 0.45 + h * (1 - 0.62 * Math.pow(Math.min(r, 2.04) / 2.04, 2))

// The bean settles in a flute of the pre-breaker, its inner side on the blade crests.
const REST_Y = RING_TOP + 0.12
const REST_R = 1.62
/** Half the bean's length as an angle at the rest radius: the blade meets its end, not its middle. */
const BEAN_HALF = 0.5 / REST_R + 0.02

/**
 * Solve the composition: put the bean where a blade face will arrive exactly at
 * bean_contact, as close as possible to the angle the camera approaches from.
 */
export function solvePlan(desiredDeg: number, heapGrams: number) {
  const tc = CUES.bean_contact
  const yl = REST_Y - coneBottom()
  const want = (desiredDeg * Math.PI) / 180
  let best = 0
  let bd = Infinity
  for (let k = 0; k < 6; k++) {
    // Leading face of blade k (local u), turned by the burr at contact time; the burr
    // has turned many times by then, so compare angles modulo a turn.
    const face = (TWO_PI * (k + 0.15 + 0.32 * yl)) / 6 + theta(tc)
    const phi = want + wrapAngle(face - BEAN_HALF - want)
    const d = Math.abs(phi - want)
    if (d < bd) {
      bd = d
      best = phi
    }
  }
  plan.phiL = best
  polar(best, REST_R + 0.15, RING_TOP + 0.05, plan.lip)
  polar(best, REST_R, REST_Y, plan.rest)
  // Lying along the gap: long axis tangential (towards the oncoming blade),
  // rounded back up and tipped outward, flat side resting on the lip.
  const er = new THREE.Vector3(Math.sin(best), 0, Math.cos(best))
  const et = new THREE.Vector3(Math.cos(best), 0, -Math.sin(best))
  const z = new THREE.Vector3().copy(UP).multiplyScalar(0.92).addScaledVector(er, 0.38).normalize()
  const y = et.clone().addScaledVector(z, -et.dot(z)).normalize()
  const x = new THREE.Vector3().crossVectors(y, z)
  plan.restQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z))

  plan.heapH = Math.min(4.1, heapGrams * 0.17)
  // Choose the followed fragment: a mid-sized piece that carries some skin, so it
  // reads as "a piece of bean" (dark roast outside, pale inside).
  const f = getFracture()
  let pick = 0
  let score = -Infinity
  f.l2.forEach((c, i) => {
    const s = -Math.abs(c.r - 0.15) * 8 - Math.abs(c.skin - 0.4) * 2 + (c.parent === 1 ? 0.6 : 0)
    if (s > score) {
      score = s
      pick = i
    }
  })
  plan.subject = pick
  // Landing: carried round until it leaves the gap, then thrown inward onto the mound.
  const exitPhi = best + 0.9 * (theta(CUES.grounds_release) - theta(CUES.bean_contact))
  plan.phiLand = exitPhi - 0.1
  const rl = 1.32
  polar(plan.phiLand, rl, heapY(rl) + 0.05, plan.land)
}

/* ------------------------------------------------------------------ */
/* Poses                                                                */
/* ------------------------------------------------------------------ */

export interface Pose {
  p: THREE.Vector3
  q: THREE.Quaternion
  s: number
}
export const pose = (): Pose => ({ p: new THREE.Vector3(), q: new THREE.Quaternion(), s: 1 })

const _q = new THREE.Quaternion()
const _q2 = new THREE.Quaternion()
const _v = new THREE.Vector3()
const _v2 = new THREE.Vector3()
const _axis = new THREE.Vector3()

/** Rotate a point about the grinder axis. */
function carry(p: THREE.Vector3, dphi: number) {
  const c = Math.cos(dphi)
  const s = Math.sin(dphi)
  const x = p.x * c + p.z * s
  const z = -p.x * s + p.z * c
  p.x = x
  p.z = z
  return p
}
const carryQ = (q: THREE.Quaternion, dphi: number) => q.premultiply(_q2.setFromAxisAngle(UP, dphi))

/** Hero bean. Falls from the hopper, settles on the lip, is caught and wedged by a blade. */
export function heroBean(t: number, out: Pose) {
  const t0 = CUES.bean_drop
  const tc = CUES.bean_contact
  const dTau = Math.max(0, tau(t) - tau(t0))
  const fallH = 9.2 - REST_Y
  const tFall = Math.sqrt((2 * fallH) / G)
  const k = clamp(dTau / tFall)
  const fall = k * k // y follows gravity exactly; everything else rides the same curve
  // Start: under the pile, a little inboard and ahead of the rest point.
  polar(plan.phiL + 0.08 * (1 - fall), 1.5 + (REST_R - 1.5) * Math.pow(k, 0.7), 9.2 - fallH * fall, out.p)
  // Settle: a small rebound once it lands.
  const after = dTau - tFall
  if (after > 0) out.p.y += 0.035 * Math.exp(-after * 70) * Math.abs(Math.sin(after * 95))
  // Tumble on the way down, ending in the resting orientation.
  _axis.set(0.6, 0.3, 0.75).normalize()
  _q.setFromAxisAngle(_axis, (1 - smoothstep(0, 1, k)) * 2.4)
  out.q.copy(plan.restQ).multiply(_q)
  out.s = 1

  // Contact: the leading face of a blade arrives and pushes it along the lip,
  // wedging it against the ring's teeth.
  if (t > tc) {
    const dphi = theta(t) - theta(tc)
    carry(out.p, dphi)
    carryQ(out.q, dphi)
    const w = smoothstep(tc, tc + 1.2, t)
    // pressed outward and down into the lip, tipping as the far end lifts
    _v.set(Math.sin(angleOf(out.p)), 0, Math.cos(angleOf(out.p)))
    out.p.addScaledVector(_v, 0.04 * w).y -= 0.05 * w
    _axis.set(Math.cos(angleOf(out.p)), 0, -Math.sin(angleOf(out.p)))
    out.q.premultiply(_q.setFromAxisAngle(_v, 0.09 * w))
    // the hit itself: a short, stiff shudder
    const e = t - tc
    const shake = Math.exp(-e * 9) * Math.sin(e * 70) * 0.012 * (e > 0 ? 1 : 0)
    out.q.premultiply(_q.setFromAxisAngle(_axis, shake))
  }
  return out
}

/** Crack progress on the whole bean (0 → 1 between contact and fracture). */
export const crackL0 = (t: number) => smoothstep(CUES.bean_contact + 0.15, CUES.bean_fracture, t)
/** Crack progress on the first-level fragments, before they split again. */
export const crackL1 = (t: number) => smoothstep(CUES.bean_fracture + 0.35, CUES.fragments_split, t)

const fragRand = (i: number, salt: number) => rng(1000 + i * 31 + salt)

const _bean = pose()
const _parent = pose()

/** First-level fragment i (valid from bean_fracture). */
export function fragment1(i: number, t: number, out: Pose) {
  const f = getFracture()
  const tf = CUES.bean_fracture
  heroBean(tf, _bean)
  const c = f.l1[i]
  // Starting pose: exactly where it sat inside the bean.
  out.p.copy(c.c).applyQuaternion(_bean.q).add(_bean.p)
  out.q.copy(_bean.q)
  out.s = 1
  if (t <= tf) return out
  const r = fragRand(i, 1)
  const dTau = tau(t) - tau(tf)
  // Separate away from the contact, decelerating (friction in the gap).
  _v.copy(c.c).sub(f.contact).normalize().applyQuaternion(_bean.q)
  _v.y = Math.min(_v.y, 0.15)
  const v0 = 4 + r() * 3
  const kf = 22
  out.p.addScaledVector(_v.normalize(), (v0 / kf) * (1 - Math.exp(-kf * dTau)))
  // Carried by the blade (a little slip), sinking into the gap.
  const dt = t - tf
  carry(out.p, (0.92 + r() * 0.08) * (theta(t) - theta(tf)))
  out.p.y -= (0.025 + r() * 0.03) * dt * dt + 0.02 * dt
  confine(out.p, c.r)
  _axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
  const w0 = 30 + r() * 30
  out.q.premultiply(_q.setFromAxisAngle(_axis, (w0 / 14) * (1 - Math.exp(-14 * dTau))))
  carryQ(out.q, theta(t) - theta(tf))
  return out
}

/** Second-level fragment j (valid from fragments_split). */
export function fragment2(j: number, t: number, out: Pose) {
  const f = getFracture()
  const ts = CUES.fragments_split
  const c = f.l2[j]
  const parent = f.l1[c.parent]
  fragment1(c.parent, ts, _parent)
  _v2.copy(c.c).sub(parent.c).applyQuaternion(_parent.q)
  out.p.copy(_parent.p).add(_v2)
  out.q.copy(_parent.q)
  out.s = 1
  if (t <= ts) return out
  const r = fragRand(j, 2)
  const dTau = tau(t) - tau(ts)
  const dt = t - ts
  _v.copy(_v2).normalize()
  const v0 = 3 + r() * 3
  out.p.addScaledVector(_v, (v0 / 18) * (1 - Math.exp(-18 * dTau)))
  carry(out.p, (0.86 + r() * 0.12) * (theta(t) - theta(ts)))
  out.p.y -= (0.05 + r() * 0.05) * dt * dt + 0.03 * dt
  confine(out.p, c.r)
  _axis.set(r() - 0.5, r() - 0.5, r() - 0.5).normalize()
  out.q.premultiply(_q.setFromAxisAngle(_axis, ((25 + r() * 40) / 12) * (1 - Math.exp(-12 * dTau))))
  carryQ(out.q, theta(t) - theta(ts))
  // Ground finer on the way down: pieces lose size as the gap closes.
  out.s = 1 - 0.35 * smoothstep(ts + 1, ts + 6, t)
  return out
}

const _gen = pose()
const _start = pose()

/**
 * The followed particle: one second-level fragment that becomes the subject. From
 * particle_follow it is steered down the gap to the exit, cut finer as it goes, then
 * falls free into the cup and lands on the mound.
 */
export function subject(t: number, out: Pose) {
  const j = plan.subject
  const ts = CUES.fragments_split
  const tf = CUES.particle_follow
  const te = CUES.grounds_release
  if (t <= tf) return fragment2(j, Math.max(t, ts), out)

  fragment2(j, t, _gen)
  fragment2(j, tf, _start)
  // Designed path: down the gap on an accelerating curve, held at the gap's centre.
  const k = clamp((t - tf) / (te - tf))
  const yEnd = RING_BOTTOM + 0.04
  const desc = k * k * (3 - 2 * k) * 0.55 + k * k * 0.45
  const y = _start.p.y + (yEnd - _start.p.y) * desc
  const phi = angleOf(_start.p) + 0.82 * (theta(Math.min(t, te)) - theta(tf))
  const r = (coneR(y) + ringR(y)) / 2
  polar(phi, r, y, _v)
  const w = smoothstep(tf, tf + 1.3, t)
  out.p.copy(_gen.p).lerp(_v, w)
  // Slow, readable tumble; one face catches the light every couple of seconds.
  _axis.set(0.3, 1, 0.2).normalize()
  out.q.copy(_start.q).premultiply(_q.setFromAxisAngle(_axis, (t - tf) * 0.55))
  carryQ(out.q, theta(Math.min(t, te)) - theta(tf))
  out.s = _start.s * (1 - 0.42 * smoothstep(tf + 0.5, te, t))

  if (t > te) {
    // Free fall in subject time, drifting inward to the landing point.
    const dTau = tau(t) - tau(te)
    const h = yEnd - plan.land.y
    const tFall = Math.sqrt((2 * h) / G)
    const kk = clamp(dTau / tFall)
    const yy = yEnd - h * kk * kk
    const exitR = (coneR(yEnd) + ringR(yEnd)) / 2
    const ex = polar(phi, exitR, yEnd, _v2)
    out.p.copy(ex).lerp(plan.land, smoothstep(0, 1, Math.pow(kk, 0.8)))
    out.p.y = yy
    const after = dTau - tFall
    if (after > 0) out.p.y += 0.02 * Math.exp(-after * 60) * Math.abs(Math.sin(after * 80))
    out.q.premultiply(_q.setFromAxisAngle(_axis, Math.min(dTau, tFall) * 22))
  }
  return out
}

/** Exit point and time of the followed particle (the grounds cloud is built around it). */
export function exitFrame() {
  const p = subject(CUES.grounds_release, pose()).p
  return { p, phi: angleOf(p), tau: tau(CUES.grounds_release) }
}

const _sum = new THREE.Vector3()
const _f = pose()
/** What the lens holds during contact and fracture: the bean, then the centre of its pieces. */
export function cluster(t: number, out: THREE.Vector3) {
  const tf = CUES.bean_fracture
  heroBean(Math.min(t, tf), _bean)
  out.copy(_bean.p)
  if (t <= tf) return out
  const f = getFracture()
  _sum.set(0, 0, 0)
  for (let i = 0; i < f.l1.length; i++) {
    fragment1(i, t, _f)
    _sum.add(_f.p)
    fragment1(i, tf, _f)
    _sum.sub(_f.p)
  }
  return out.addScaledVector(_sum, 1 / f.l1.length)
}

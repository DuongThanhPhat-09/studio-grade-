import * as THREE from 'three'
import { clamp, smoothstep } from '../animation/motion'
import { CUES, END } from './timeline'
import { cluster, heroBean, plan, pose, subject, angleOf } from './paths'

/**
 * The film's camera, written as a cinematographer would plan it: always a subject,
 * a lens, a distance and a height — never a free spline.
 *
 *  - Distance is interpolated in log space. A dolly from 90 cm to 0.8 cm then reads at
 *    a constant perceived speed (each second covers the same *ratio* of scale), which is
 *    what makes the descent and the final pull-back feel continuous rather than lurching.
 *  - Tracks are monotone cubic (Fritsch–Carlson): velocity is continuous through every key
 *    and nothing overshoots, so the lens eases rather than bounces.
 *  - The subject is a function too: product → lip → bean → its pieces → one fragment →
 *    the landing point → product. Hand-offs are cross-fades of the look-at point while the
 *    subjects are in the same part of the frame.
 *  - Up is always world up. No roll, ever.
 */

type Key = [number, number]

export function track(keys: Key[], log = false) {
  const n = keys.length
  const x = keys.map((k) => k[0])
  const y = keys.map((k) => (log ? Math.log(k[1]) : k[1]))
  const d: number[] = []
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]))
  const m = new Array<number>(n)
  m[0] = 0
  m[n - 1] = 0
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i] / d[i]
    const b = m[i + 1] / d[i]
    const s = a * a + b * b
    if (s > 9) {
      const tt = 3 / Math.sqrt(s)
      m[i] = tt * a * d[i]
      m[i + 1] = tt * b * d[i]
    }
  }
  return (t: number) => {
    if (t <= x[0]) return log ? Math.exp(y[0]) : y[0]
    if (t >= x[n - 1]) return log ? Math.exp(y[n - 1]) : y[n - 1]
    let i = 0
    while (t > x[i + 1]) i++
    const h = x[i + 1] - x[i]
    const s = (t - x[i]) / h
    const s2 = s * s
    const s3 = s2 * s
    const v = (2 * s3 - 3 * s2 + 1) * y[i] + (s3 - 2 * s2 + s) * h * m[i] + (-2 * s3 + 3 * s2) * y[i + 1] + (s3 - s2) * h * m[i + 1]
    return log ? Math.exp(v) : v
  }
}

export interface Lens {
  target: THREE.Vector3
  /** Degrees; az 0 = camera on +Z, matching the Director's orbit convention. */
  az: number
  el: number
  dist: number
  fov: number
  sx: number
  sy: number
}
export const lens = (): Lens => ({ target: new THREE.Vector3(), az: 0, el: 0, dist: 60, fov: 20, sx: 0, sy: 0 })

const DEG = 180 / Math.PI
const HERO_T = new THREE.Vector3(0, 9.3, 0)
const PRODUCT_T = new THREE.Vector3(0, 9.0, 0)

/** Built once per run, after the plan is solved (angles depend on it). */
export function buildCamera(portrait: boolean) {
  const AL = plan.phiL * DEG
  const AF = 24 // follow: the lens trails the particle, a little outboard
  const landAz = plan.phiLand * DEG + AF
  const AH = landAz + 34 // the pull-back swings round to the hero side

  // Portrait: product shots stand further back and a touch higher; macro shots keep the
  // subject centred, look more down the gap (a vertical composition) and use a wider lens.
  const P = portrait

  const dist = track(
    [
      [0, P ? 150 : 92],
      [1.6, P ? 146 : 90],
      [3.0, P ? 138 : 86],
      [8.6, P ? 9.5 : 7.5],
      [10.6, P ? 4.2 : 3.4],
      [13.2, P ? 3.4 : 2.9],
      [14.5, P ? 2.7 : 2.3],
      [16.4, P ? 2.1 : 1.75],
      [17.8, P ? 1.2 : 1.0],
      [22.4, P ? 1.05 : 0.88],
      [25.6, P ? 1.15 : 0.95],
      [27.0, P ? 0.95 : 0.8],
      [33.4, P ? 136 : 84],
      [END, P ? 132 : 81],
    ],
    true,
  )
  const el = track([
    [0, 7],
    [3, 8],
    [8.6, P ? 30 : 26],
    [10.6, P ? 40 : 33],
    // At contact the lens rises to look down into the throat: the blade's edge meeting
    // the bean's end is only visible from above.
    [12.4, P ? 52 : 46],
    [13.4, P ? 58 : 54],
    [14.6, P ? 54 : 49],
    [16.4, P ? 42 : 34],
    [17.8, P ? 30 : 17],
    [22.4, P ? 26 : 13],
    [24.4, P ? 40 : 30],
    [25.6, P ? 56 : 50],
    [27.0, P ? 62 : 57],
    [30.4, P ? 28 : 24],
    [33.4, P ? 8 : 5],
    [END, P ? 7 : 4.5],
  ])
  const fov = track([
    [0, P ? 21 : 15],
    [3, P ? 21 : 15],
    [8.6, P ? 28 : 20],
    [10.6, P ? 34 : 25],
    [16.4, P ? 36 : 26],
    [17.8, P ? 40 : 30],
    [27.0, P ? 40 : 30],
    [31.0, P ? 26 : 19],
    [33.4, P ? 22 : 16],
    [END, P ? 22 : 16],
  ])
  const az = track([
    [0, AL - 26],
    [3, AL - 20],
    [8.6, AL - 3],
    [10.6, AL],
    [13.2, AL + 3],
    [16.4, AL + 6],
  ])
  const sx = track([
    [32, 0],
    [35.5, P ? 0 : 0.14],
  ])
  const sy = track([
    [32, 0],
    [35.5, P ? 0.2 : 0.02],
  ])

  const a = new THREE.Vector3()
  const sp = pose()
  const bp = pose()

  return {
    AL,
    AH,
    dist,
    /** Resolve the lens at film time t. */
    at(t: number, out: Lens) {
      // ── Look-at: a chain of subjects, each taking over in its window ──
      const T = out.target.copy(PRODUCT_T)
      // Approach: the look-at slides to the lip as the scale shrinks, so the lip stays
      // put on screen while everything else grows around it.
      const dz = dist(t)
      const zoom = clamp(Math.log(86 / dz) / Math.log(86 / 7.5))
      T.lerp(plan.lip, smoothstep(0.05, 0.85, zoom) * smoothstep(3, 3.2, t))
      if (t > 10.3) T.lerp(heroBean(Math.min(t, CUES.bean_fracture), bp).p, 0.85 * smoothstep(10.3, 12.4, t))
      if (t > 12.6) T.lerp(cluster(t, a), smoothstep(12.6, 13.6, t))
      if (t > 16.2) T.lerp(subject(t, sp).p, smoothstep(16.2, 17.9, t))
      if (t > 25.4) T.lerp(plan.land, smoothstep(25.4, 26.6, t))
      if (t > 27.0) {
        // Pull-back: the product takes over as the frame widens past the cup.
        const out01 = clamp(Math.log(dz / 0.8) / Math.log(84 / 0.8))
        T.lerp(HERO_T, smoothstep(0.32, 0.92, out01))
      }

      // ── Orbit: approach angles, then trailing the particle, then the swing round ──
      let A = az(t)
      if (t > 16.4) {
        const ps = subject(Math.min(t, 25.6), sp).p
        const follow = angleOf(ps) * DEG + AF
        A = lerpAngle(A, follow, smoothstep(16.4, 17.8, t))
      }
      if (t > 27.0) A = lerpAngle(landAz, AH, smoothstep(27.0, 33.8, t))

      // ── Hand-held breath at macro scale, and the jolt of contact ──
      const m = 1 - smoothstep(3, 9, dz)
      const breath = dz * 0.0022 * m
      T.x += Math.sin(t * 0.71 + 1.3) * breath
      T.y += Math.sin(t * 0.53 + 0.4) * breath * 0.8
      T.z += Math.sin(t * 0.37 + 2.1) * breath
      for (const c of [CUES.bean_contact, CUES.bean_fracture]) {
        const e = t - c
        if (e > 0 && e < 1.2) T.y += dz * 0.006 * Math.exp(-e * 7) * Math.sin(e * 46)
      }

      out.az = A
      out.el = el(t)
      out.dist = dz
      out.fov = fov(t)
      out.sx = sx(t)
      out.sy = sy(t)
      return out
    },
  }
}

function lerpAngle(a: number, b: number, k: number) {
  let d = (b - a) % 360
  if (d > 180) d -= 360
  if (d < -180) d += 360
  return a + d * k
}

/** Camera position for a lens (same convention as the Director). */
export function lensPosition(l: Lens, out: THREE.Vector3) {
  const r = Math.PI / 180
  const ca = Math.cos(l.el * r)
  return out.set(
    l.target.x + l.dist * Math.sin(l.az * r) * ca,
    l.target.y + l.dist * Math.sin(l.el * r),
    l.target.z + l.dist * Math.cos(l.az * r) * ca,
  )
}

/** Blend two lenses (entry from wherever the site's camera was). */
export function blendLens(a: Lens, b: Lens, k: number, out: Lens) {
  out.target.copy(a.target).lerp(b.target, k)
  out.az = lerpAngle(a.az, b.az, k)
  out.el = a.el + (b.el - a.el) * k
  out.dist = Math.exp(Math.log(a.dist) + (Math.log(b.dist) - Math.log(a.dist)) * k)
  out.fov = a.fov + (b.fov - a.fov) * k
  out.sx = a.sx + (b.sx - a.sx) * k
  out.sy = a.sy + (b.sy - a.sy) * k
  return out
}

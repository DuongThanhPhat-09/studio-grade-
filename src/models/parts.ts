import * as THREE from 'three'
import { lathe, profile, turned, type P } from './geometry/lathe'
import { innerBurrGeometry, outerBurrGeometry } from './geometry/burr'
import { crankArmGeometry, crankTopY, CRANK } from './geometry/crank'

/**
 * Orme No. 1 — dimensions in centimetres, floor at y = 0, axis along Y.
 * Drawn like a turning drawing: each profile walks with material on its right,
 * outer surfaces bottom → top, bores top → bottom.
 */
export const DIM = {
  r: 2.4,
  cupTop: 4.97,
  bodyBottom: 5.03,
  gripBottom: 7.5,
  gripTop: 12.5,
  bodyTop: 14.5,
  dialTop: 15.15,
  capTop: 15.26,
  armY: 15.55,
  outerBurrY: 5.62,
  innerBurrY: 5.85,
  bearingY: 8.35,
  upperBearingY: 14.0,
}

/** Exploded offsets (cm along the axis) and stagger, top parts leave first. */
export const EXPLODE = {
  lift: 1.6,
  cup: { y: -1.2, delay: 0.3 },
  outerBurr: { y: -0.3, delay: 0.26 },
  burr: { y: 1.6, delay: 0.22 },
  bearing: { y: 2.5, delay: 0.18 },
  body: { y: 6.6, delay: 0.12 },
  dial: { y: 7.5, delay: 0.07 },
  cap: { y: 8.3, delay: 0.04 },
  crank: { y: 9.0, delay: 0 },
}

function cup() {
  return turned(
    [
      [0, 0.05],
      [2.0, 0.05, 0.02],
      [2.08, 0.0, 0.03],
      [2.4, 0.0, 0.22],
      [2.4, DIM.cupTop, 0.035],
      [2.24, DIM.cupTop],
      [2.24, 5.55, 0.02],
      [2.08, 5.55, 0.02],
      [2.08, 0.45, 0.25],
      [0, 0.45],
    ],
    { segments: 160 },
  )
}

/** Thread on the cup neck: a helix, three turns. */
function thread() {
  const pts: THREE.Vector3[] = []
  for (let i = 0; i <= 180; i++) {
    const t = i / 180
    const a = t * Math.PI * 2 * 3
    pts.push(new THREE.Vector3(Math.sin(a) * 2.262, 5.06 + t * 0.4, Math.cos(a) * 2.262))
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 360, 0.03, 6, false)
}

function body() {
  const pts: P[] = [
    [2.27, DIM.bodyBottom],
    [2.4, DIM.bodyBottom, 0.035],
    [2.4, DIM.bodyTop, 0.24],
    [1.1, DIM.bodyTop],
    [1.1, 14.36],
    [0.32, 14.36],
    [0.32, 8.6],
    [2.27, 8.6, 0.05],
    [2.27, DIM.bodyBottom + 0.001],
  ]
  const dense = profile(pts, 8)
  const res = lathe(dense, { segments: 192 })
  // Map a height on the outer wall to UV v (for the etched mark).
  const vAt = (y: number) => {
    let arc = 0
    for (let i = 1; i < dense.length; i++) {
      const a = dense[i - 1]
      const b = dense[i]
      const seg = a.distanceTo(b)
      if (a.x > 2.39 && b.x > 2.39 && y >= a.y && y <= b.y) return (arc + (y - a.y)) / res.arc
      arc += seg
    }
    return 0.5
  }
  return { ...res, vAt, circumference: Math.PI * 2 * DIM.r }
}

function gripBands() {
  const bottom = turned(
    [
      [2.4, DIM.gripBottom],
      [2.47, DIM.gripBottom, 0.025],
      [2.47, 7.78, 0.01],
      [2.442, 7.83],
    ],
    { segments: 192, crease: 25 },
  )
  const top = turned(
    [
      [2.442, 12.17],
      [2.47, 12.22, 0.01],
      [2.47, DIM.gripTop, 0.025],
      [2.4, DIM.gripTop],
    ],
    { segments: 192, crease: 25 },
  )
  return { bottom, top }
}

export const KNURL_PITCH = 0.12 // cm between crests

function gripKnurl() {
  const res = turned(
    [
      [2.442, 7.83],
      [2.466, 7.86, 0.01],
      [2.466, 12.14, 0.01],
      [2.442, 12.17],
    ],
    { segments: 256, crease: 25 },
  )
  const circumference = Math.PI * 2 * 2.466
  return { ...res, circumference }
}

function dial() {
  const pts: P[] = [
    [1.15, DIM.bodyTop],
    [1.8, DIM.bodyTop, 0.03],
    [1.8, DIM.dialTop, 0.07],
    [1.15, DIM.dialTop],
  ]
  const dense = profile(pts, 8)
  const res = lathe(dense, { segments: 192 })
  // v-range of the vertical outer face, for the engraving.
  let arc = 0
  let from = 0
  let to = 1
  for (let i = 1; i < dense.length; i++) {
    const a = dense[i - 1]
    const b = dense[i]
    if (a.x > 1.799 && b.x > 1.799) {
      from = arc / res.arc
      to = (arc + a.distanceTo(b)) / res.arc
    }
    arc += a.distanceTo(b)
  }
  return { ...res, vFrom: from, vTo: to }
}

function cap() {
  return turned(
    [
      [0.34, 15.05],
      [1.12, 15.05, 0.02],
      [1.12, 15.2, 0.05],
      [0.36, DIM.capTop],
    ],
    { segments: 160 },
  )
}

function spacer() {
  return turned(
    [
      [0.3, DIM.capTop],
      [0.52, DIM.capTop, 0.02],
      [0.52, DIM.armY, 0.02],
      [0.3, DIM.armY],
    ],
    { segments: 96 },
  )
}

/** Acorn nut on the crank hub, local to the crank group. */
function capNut() {
  const y0 = crankTopY()
  const pts: THREE.Vector2[] = [new THREE.Vector2(0.0, y0), new THREE.Vector2(0.47, y0)]
  const p = profile(
    [
      [0, y0],
      [0.47, y0, 0.02],
      [0.47, y0 + 0.14, 0.02],
      [0.44, y0 + 0.16],
    ],
    4,
  )
  pts.length = 0
  pts.push(...p)
  const domeH = 0.24
  for (let i = 1; i <= 16; i++) {
    const a = (i / 16) * (Math.PI / 2)
    pts.push(new THREE.Vector2(Math.cos(a) * 0.44, y0 + 0.16 + Math.sin(a) * domeH))
  }
  return lathe(pts, { segments: 96 })
}

function washer() {
  const y0 = crankTopY()
  return turned(
    [
      [0, y0],
      [0.42, y0, 0.02],
      [0.42, y0 + 0.09, 0.03],
      [0, y0 + 0.09],
    ],
    { segments: 96 },
  )
}

function knob() {
  const y0 = crankTopY() + 0.09
  const spline = new THREE.SplineCurve(
    [
      [0.46, 0],
      [0.43, 0.22],
      [0.55, 0.85],
      [0.76, 1.55],
      [0.77, 2.08],
      [0.6, 2.42],
      [0.3, 2.56],
      [0, 2.59],
    ].map(([r, y]) => new THREE.Vector2(r, y + y0)),
  )
  const pts = [new THREE.Vector2(0, y0), new THREE.Vector2(0.4, y0), ...spline.getPoints(72)]
  return lathe(pts, { segments: 128, crease: 50 })
}

function bearing(rIn: number, rOut: number, h: number) {
  const outer = turned(
    [
      [rOut - 0.11, -h / 2],
      [rOut, -h / 2, 0.025],
      [rOut, h / 2, 0.025],
      [rOut - 0.11, h / 2],
    ],
    { segments: 96 },
  )
  const inner = turned(
    [
      [rIn + 0.11, h / 2],
      [rIn, h / 2, 0.02],
      [rIn, -h / 2, 0.02],
      [rIn + 0.11, -h / 2],
    ],
    { segments: 96 },
  )
  const seal = turned(
    [
      [rIn + 0.11, -h / 2 + 0.035],
      [rOut - 0.11, -h / 2 + 0.035],
      [rOut - 0.11, h / 2 - 0.035],
      [rIn + 0.11, h / 2 - 0.035],
    ],
    { segments: 96 },
  )
  return { outer, inner, seal }
}

/** Hexagonal drive shaft — flat-shaded, so its rotation reads through the X-ray shell. */
function shaft() {
  const g = new THREE.CylinderGeometry(0.3, 0.3, DIM.armY - 5.9, 6, 1).toNonIndexed()
  g.translate(0, (DIM.armY + 5.9) / 2, 0)
  g.computeVertexNormals()
  return g
}

let parts: ReturnType<typeof build> | null = null

function build(detail: number) {
  return {
    cup: cup(),
    thread: thread(),
    body: body(),
    grip: gripBands(),
    knurl: gripKnurl(),
    dial: dial(),
    cap: cap(),
    spacer: spacer(),
    arm: crankArmGeometry(),
    capNut: capNut(),
    washer: washer(),
    knob: knob(),
    bearing: bearing(0.3, 1.0, 0.5),
    shaft: shaft(),
    innerBurr: innerBurrGeometry(detail),
    outerBurr: outerBurrGeometry(detail),
  }
}

export function getParts(detail = 1) {
  if (!parts) parts = build(detail)
  return parts
}

export { CRANK, crankTopY }

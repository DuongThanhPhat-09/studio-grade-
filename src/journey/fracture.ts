import * as THREE from 'three'
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js'

/**
 * Coffee at every scale, built procedurally:
 *
 *  - the hero bean: the same bean as the hopper's, at 70 × 54 segments, with a
 *    faint wrinkle, a mottled roast and silverskin caught in the crease
 *  - its fracture: a two-level Voronoi split (5 large cells, each split again into
 *    4–5), every fragment the convex hull of the bean's own surface points plus a
 *    dense interior sample inside its cell. The hull's cut faces come out naturally
 *    rough, and they meet their neighbours along exactly the lines the crack shader
 *    draws on the whole bean, so the swap from "cracked bean" to "pieces" is invisible
 *  - grounds: a few irregular convex shards, instanced
 *
 * Everything is seeded and deterministic.
 */

export function rng(seed: number) {
  let s = seed >>> 0 || 1
  return () => {
    s = Math.imul(s ^ (s >>> 15), 2246822507) ^ Math.imul(s ^ (s >>> 13), 3266489909)
    s ^= s >>> 16
    s = (s + 0x6d2b79f5) >>> 0
    return s / 4294967296
  }
}

/* 3D value noise for the bean's surface. */
function h3(x: number, y: number, z: number) {
  let h = (x * 374761393 + y * 668265263 + z * 1440662683) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295
}
function vnoise3(x: number, y: number, z: number) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const f = (t: number) => t * t * (3 - 2 * t)
  const u = f(x - xi)
  const v = f(y - yi)
  const w = f(z - zi)
  let r = 0
  for (let k = 0; k < 2; k++)
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++)
        r += h3(xi + i, yi + j, zi + k) * (i ? u : 1 - u) * (j ? v : 1 - v) * (k ? w : 1 - w)
  return r
}

/** Bean proportions (cm): ~1.0 long, 0.66 wide, 0.37 thick. Same as the hopper beans. */
export const BEAN = { sx: 0.33, sy: 0.5, sz: 0.26, flat: 0.42 }

/** Unit-sphere point → bean surface (before surface noise). Returns crease weight too. */
function shape(x: number, y: number, z: number) {
  let crease = 0
  if (z < 0) {
    z *= BEAN.flat
    crease = Math.exp(-(x * x) / 0.012) * Math.min(1, -z * 6)
    z += 0.22 * crease
  }
  return { x: x * BEAN.sx, y: y * BEAN.sy, z: z * BEAN.sz, crease }
}

export function beanGeometry(w = 40, h = 28, surface = false) {
  const g = new THREE.SphereGeometry(1, w, h)
  const p = g.attributes.position as THREE.BufferAttribute
  const mottle = new Float32Array(p.count)
  const crease = new Float32Array(p.count)
  for (let i = 0; i < p.count; i++) {
    const s = shape(p.getX(i), p.getY(i), p.getZ(i))
    p.setXYZ(i, s.x, s.y, s.z)
    crease[i] = s.crease
    if (surface) {
      mottle[i] = vnoise3(s.x * 9 + 3, s.y * 9, s.z * 9) * 0.65 + vnoise3(s.x * 26, s.y * 26 + 5, s.z * 26) * 0.35
    }
  }
  g.computeVertexNormals()
  if (surface) {
    // A faint wrinkle along the normal: roasted beans are not smooth ellipsoids.
    const n = g.attributes.normal as THREE.BufferAttribute
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const d = (vnoise3(x * 30, y * 22 + 7, z * 30) - 0.5) * 0.007 + (vnoise3(x * 70, y * 70, z * 70) - 0.5) * 0.0022
      p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d)
    }
    g.computeVertexNormals()
  }
  g.setAttribute('aMottle', new THREE.BufferAttribute(mottle, 1))
  g.setAttribute('aCrease', new THREE.BufferAttribute(crease, 1))
  g.setAttribute('aSkin', new THREE.BufferAttribute(new Float32Array(p.count).fill(1), 1))
  g.computeBoundingSphere()
  return g
}

/** Inside test against the bean volume (crease ignored — it is a shallow groove). */
function inside(x: number, y: number, z: number, shrink = 0.985) {
  const zz = z > 0 ? z / BEAN.sz : z / (BEAN.sz * BEAN.flat)
  return (x / BEAN.sx) ** 2 + (y / BEAN.sy) ** 2 + zz * zz < shrink * shrink
}

export interface Fragment {
  geometry: THREE.BufferGeometry
  /** Centroid in bean-local space (the geometry is centred on it). */
  c: THREE.Vector3
  /** Rough radius, for confinement in the burr gap. */
  r: number
  /** Second-level crack seeds, fragment-local (L1 only). */
  seeds: THREE.Vector3[]
  /** Children indices into `l2` (L1 only). */
  children: number[]
  /** Fraction of the surface that is roasted skin. */
  skin: number
}

export interface Fracture {
  bean: THREE.BufferGeometry
  /** First-level crack seeds, bean-local. */
  seeds: THREE.Vector3[]
  /** Where the blade meets the bean, bean-local. */
  contact: THREE.Vector3
  l1: Fragment[]
  l2: (Fragment & { parent: number })[]
}

let cached: Fracture | null = null

export function getFracture(): Fracture {
  if (cached) return cached
  const r = rng(1931)
  const bean = beanGeometry(70, 54, true)
  const P = bean.attributes.position as THREE.BufferAttribute
  const N = bean.attributes.normal as THREE.BufferAttribute
  const M = bean.attributes.aMottle as THREE.BufferAttribute
  const C = bean.attributes.aCrease as THREE.BufferAttribute

  // Surface points (deduplicated: the sphere has seam duplicates).
  const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`
  const skinInfo = new Map<string, { n: THREE.Vector3; m: number; c: number }>()
  const surface: THREE.Vector3[] = []
  for (let i = 0; i < P.count; i++) {
    const k = key(P.getX(i), P.getY(i), P.getZ(i))
    if (skinInfo.has(k)) continue
    skinInfo.set(k, { n: new THREE.Vector3(N.getX(i), N.getY(i), N.getZ(i)), m: M.getX(i), c: C.getX(i) })
    surface.push(new THREE.Vector3(P.getX(i), P.getY(i), P.getZ(i)))
  }

  // Interior sample: dense enough that hull cut faces sit close to the true cell walls.
  const interior: THREE.Vector3[] = []
  while (interior.length < 5200) {
    const x = (r() * 2 - 1) * BEAN.sx
    const y = (r() * 2 - 1) * BEAN.sy
    const z = (r() * 2 - 1) * BEAN.sz
    if (inside(x, y, z)) interior.push(new THREE.Vector3(x, y, z))
  }

  // The blade meets the bean near one end, on its rounded back.
  const contact = new THREE.Vector3(0.05, 0.42, 0.12)

  // Level 1: five cells, one of them small and close to the contact (it shatters first).
  const seeds = [
    new THREE.Vector3(0.04, 0.33, 0.04),
    new THREE.Vector3(-0.13, 0.08, 0.02),
    new THREE.Vector3(0.14, 0.04, -0.02),
    new THREE.Vector3(-0.07, -0.25, 0.03),
    new THREE.Vector3(0.12, -0.3, -0.01),
  ]
  const nearest = (p: THREE.Vector3, s: THREE.Vector3[]) => {
    let best = 0
    let bd = Infinity
    for (let i = 0; i < s.length; i++) {
      const d = p.distanceToSquared(s[i])
      if (d < bd) {
        bd = d
        best = i
      }
    }
    return best
  }

  const hull = (pts: THREE.Vector3[]) => {
    const g = new ConvexGeometry(pts)
    const pos = g.attributes.position as THREE.BufferAttribute
    const nor = g.attributes.normal as THREE.BufferAttribute
    const n = pos.count
    const skin = new Float32Array(n)
    const mottle = new Float32Array(n)
    const crease = new Float32Array(n)
    let skinFaces = 0
    for (let f = 0; f < n; f += 3) {
      const info = [0, 1, 2].map((j) => skinInfo.get(key(pos.getX(f + j), pos.getY(f + j), pos.getZ(f + j))))
      const isSkin = info.every(Boolean)
      if (isSkin) skinFaces++
      for (let j = 0; j < 3; j++) {
        const s = info[j]
        skin[f + j] = isSkin ? 1 : 0
        mottle[f + j] = s ? s.m : 0.5
        crease[f + j] = s ? s.c : 0
        // Skin keeps the bean's smooth normals; cut faces stay faceted.
        if (isSkin && s) nor.setXYZ(f + j, s.n.x, s.n.y, s.n.z)
      }
    }
    g.setAttribute('aSkin', new THREE.BufferAttribute(skin, 1))
    g.setAttribute('aMottle', new THREE.BufferAttribute(mottle, 1))
    g.setAttribute('aCrease', new THREE.BufferAttribute(crease, 1))
    g.computeBoundingBox()
    const c = new THREE.Vector3()
    g.boundingBox!.getCenter(c)
    g.translate(-c.x, -c.y, -c.z)
    g.computeBoundingSphere()
    return { geometry: g, c, r: g.boundingSphere!.radius, skin: skinFaces / (n / 3) }
  }

  const surf1 = surface.map((p) => nearest(p, seeds))
  const int1 = interior.map((p) => nearest(p, seeds))
  const l1: Fragment[] = []
  const l2: (Fragment & { parent: number })[] = []

  seeds.forEach((_, i) => {
    const pts = [...surface.filter((_, k) => surf1[k] === i), ...interior.filter((_, k) => int1[k] === i)]
    const h1 = hull(pts)
    // Level 2: split again around points of this cell.
    const inCell = interior.filter((_, k) => int1[k] === i)
    const count = i === 0 ? 5 : 4
    const sub: THREE.Vector3[] = []
    let guard = 0
    while (sub.length < count && guard++ < 2000) {
      const p = inCell[Math.floor(r() * inCell.length)]
      if (sub.every((q) => q.distanceTo(p) > 0.09)) sub.push(p.clone())
    }
    const children: number[] = []
    const surf2 = pts.map((p) => nearest(p, sub))
    sub.forEach((_, j) => {
      const cell = pts.filter((_, k) => surf2[k] === j)
      if (cell.length < 12) return
      const h2 = hull(cell)
      children.push(l2.length)
      l2.push({ ...h2, seeds: [], children: [], parent: i })
    })
    l1.push({ ...h1, seeds: sub.map((s) => s.clone().sub(h1.c)), children })
  })

  cached = { bean, seeds, contact, l1, l2 }
  return cached
}

/** An irregular shard for grounds: the hull of a handful of jittered points. */
export function shardGeometry(seed: number, n = 14) {
  const r = rng(seed)
  const pts: THREE.Vector3[] = []
  for (let i = 0; i < n; i++) {
    const u = r() * 2 - 1
    const a = r() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const k = 0.75 + r() * 0.35
    // Thinner along Y: a grain at rest lies on its broad side.
    pts.push(new THREE.Vector3(Math.cos(a) * s * k, u * 0.6 * k, Math.sin(a) * s * 0.95 * k))
  }
  const g = new ConvexGeometry(pts)
  g.computeBoundingSphere()
  const s = 1 / g.boundingSphere!.radius
  g.scale(s, s, s)
  g.computeBoundingSphere()
  return g
}

/** Silverskin chaff: a thin, slightly cupped papery flake. */
export function flakeGeometry() {
  const g = new THREE.CircleGeometry(1, 7)
  const p = g.attributes.position as THREE.BufferAttribute
  const r = rng(77)
  for (let i = 1; i < p.count; i++) {
    const k = 0.6 + r() * 0.5
    const x = p.getX(i) * k
    const y = p.getY(i) * k * 0.7
    p.setXYZ(i, x, y, (x * x + y * y) * 0.25)
  }
  g.computeVertexNormals()
  return g
}

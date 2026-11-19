import * as THREE from 'three'

/**
 * Turned-part geometry.
 *
 * Every rotationally symmetric part is described as a 2D profile (r, y) the way it
 * would be drawn for a lathe: corners carry a fillet radius, so edges catch light
 * the way machined edges do instead of rendering as razor-sharp CG seams.
 *
 * The lathe builder computes its own normals with a crease angle, so chamfers and
 * fillets shade as smooth bands while true corners stay crisp.
 */

/** Profile vertex: radius, height, optional fillet radius at this corner. */
export type P = [r: number, y: number, fillet?: number]

/** Expand a polyline with per-corner fillets into a dense profile. */
export function profile(points: P[], arcSegments = 6): THREE.Vector2[] {
  const out: THREE.Vector2[] = []
  for (let i = 0; i < points.length; i++) {
    const [r, y, f = 0] = points[i]
    const P0 = new THREE.Vector2(r, y)
    if (f <= 0 || i === 0 || i === points.length - 1) {
      out.push(P0)
      continue
    }
    const A = new THREE.Vector2(points[i - 1][0], points[i - 1][1])
    const B = new THREE.Vector2(points[i + 1][0], points[i + 1][1])
    const d1 = A.clone().sub(P0).normalize()
    const d2 = B.clone().sub(P0).normalize()
    const cos = THREE.MathUtils.clamp(d1.dot(d2), -1, 1)
    const theta = Math.acos(cos)
    if (theta < 1e-3 || Math.abs(theta - Math.PI) < 1e-3) {
      out.push(P0)
      continue
    }
    // Limit the fillet so it never eats more than 45% of either adjacent edge.
    const maxT = Math.min(A.distanceTo(P0), B.distanceTo(P0)) * 0.45
    let t = f / Math.tan(theta / 2)
    let rad = f
    if (t > maxT) {
      t = maxT
      rad = t * Math.tan(theta / 2)
    }
    const T1 = P0.clone().addScaledVector(d1, t)
    const T2 = P0.clone().addScaledVector(d2, t)
    const bis = d1.clone().add(d2).normalize()
    const C = P0.clone().addScaledVector(bis, rad / Math.sin(theta / 2))
    const a1 = Math.atan2(T1.y - C.y, T1.x - C.x)
    let a2 = Math.atan2(T2.y - C.y, T2.x - C.x)
    let da = a2 - a1
    while (da > Math.PI) da -= Math.PI * 2
    while (da < -Math.PI) da += Math.PI * 2
    a2 = a1 + da
    const n = Math.max(2, Math.round(arcSegments * (Math.abs(da) / (Math.PI / 2))))
    for (let s = 0; s <= n; s++) {
      const a = a1 + (da * s) / n
      out.push(new THREE.Vector2(C.x + Math.cos(a) * rad, C.y + Math.sin(a) * rad))
    }
  }
  return out
}

export interface LatheOptions {
  segments?: number
  /** Normals split where the profile turns more than this (degrees). */
  crease?: number
  /** UV v by arc length, normalised 0..1 over the whole profile. */
  phiStart?: number
}

export interface LatheResult {
  geometry: THREE.BufferGeometry
  /** Total profile arc length, cm. */
  arc: number
  /** Arc length (cm) at each input profile vertex — used to place decals. */
  arcAt: number[]
}

/**
 * Sweep a profile around Y. Profiles must be ordered so that walking along them
 * keeps the material on the right-hand side (outer surfaces bottom → top).
 * u = 0..1 around (u = 0.5 faces +Z), v = 0..1 by arc length.
 */
export function lathe(points: THREE.Vector2[], opts: LatheOptions = {}): LatheResult {
  const segments = opts.segments ?? 128
  const crease = THREE.MathUtils.degToRad(opts.crease ?? 34)
  const phiStart = opts.phiStart ?? -Math.PI

  // Segment normals in profile space: walking direction (dx, dy) → normal (dy, -dx).
  const segN: THREE.Vector2[] = []
  for (let j = 0; j < points.length - 1; j++) {
    const dx = points[j + 1].x - points[j].x
    const dy = points[j + 1].y - points[j].y
    segN.push(new THREE.Vector2(dy, -dx).normalize())
  }

  // Arc length per profile point.
  const arcAt: number[] = [0]
  for (let j = 1; j < points.length; j++) arcAt.push(arcAt[j - 1] + points[j].distanceTo(points[j - 1]))
  const arc = arcAt[arcAt.length - 1] || 1

  // Rings: duplicated at creases so each side keeps its own normal.
  interface Ring { r: number; y: number; nx: number; ny: number; v: number; join: boolean }
  const rings: Ring[] = []
  for (let j = 0; j < points.length; j++) {
    const p = points[j]
    const v = arcAt[j] / arc
    const nPrev = j > 0 ? segN[j - 1] : null
    const nNext = j < segN.length ? segN[j] : null
    if (nPrev && nNext) {
      const angle = Math.acos(THREE.MathUtils.clamp(nPrev.dot(nNext), -1, 1))
      if (angle > crease) {
        rings.push({ r: p.x, y: p.y, nx: nPrev.x, ny: nPrev.y, v, join: true })
        rings.push({ r: p.x, y: p.y, nx: nNext.x, ny: nNext.y, v, join: false })
      } else {
        const n = nPrev.clone().add(nNext).normalize()
        rings.push({ r: p.x, y: p.y, nx: n.x, ny: n.y, v, join: true })
      }
    } else {
      const n = (nPrev ?? nNext)!
      rings.push({ r: p.x, y: p.y, nx: n.x, ny: n.y, v, join: true })
    }
  }

  const cols = segments + 1
  const pos = new Float32Array(rings.length * cols * 3)
  const nor = new Float32Array(rings.length * cols * 3)
  const uv = new Float32Array(rings.length * cols * 2)
  for (let i = 0; i < cols; i++) {
    const u = i / segments
    const phi = phiStart + u * Math.PI * 2
    const s = Math.sin(phi)
    const c = Math.cos(phi)
    for (let j = 0; j < rings.length; j++) {
      const R = rings[j]
      const k = i * rings.length + j
      pos[k * 3] = R.r * s
      pos[k * 3 + 1] = R.y
      pos[k * 3 + 2] = R.r * c
      nor[k * 3] = R.nx * s
      nor[k * 3 + 1] = R.ny
      nor[k * 3 + 2] = R.nx * c
      uv[k * 2] = u
      uv[k * 2 + 1] = R.v
    }
  }

  const index: number[] = []
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < rings.length - 1; j++) {
      // A crease pair (same position, different normal) is not a face.
      if (rings[j].join && !rings[j + 1].join && rings[j].r === rings[j + 1].r && rings[j].y === rings[j + 1].y) continue
      const a = i * rings.length + j
      const b = (i + 1) * rings.length + j
      const c = (i + 1) * rings.length + j + 1
      const d = i * rings.length + j + 1
      index.push(a, b, d, b, c, d)
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geometry.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
  geometry.setIndex(index)
  geometry.computeBoundingSphere()
  return { geometry, arc, arcAt }
}

/** Convenience: profile → lathe geometry. */
export function turned(points: P[], opts: LatheOptions & { arcSegments?: number } = {}) {
  return lathe(profile(points, opts.arcSegments ?? 6), opts)
}

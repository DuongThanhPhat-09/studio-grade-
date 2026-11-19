import * as THREE from 'three'

/**
 * Burr geometry, generated as real displaced surfaces rather than textures:
 * the teeth must hold their silhouette in the exploded view.
 *
 * Inner burr: a cone with two families of helical teeth — six deep pre-breaker
 * blades near the top (they crack the bean) blending into 28 fine cutting teeth
 * near the bottom (they set the grind size).
 */

const frac = (x: number) => x - Math.floor(x)

/**
 * Asymmetric tooth: short steep cutting face, long relief slope. 0 = root, 1 = crest.
 * The steep face leads as the burr turns clockwise (seen from above). The macro
 * burr (journey/macroBurr.ts) evaluates the same profile on the GPU — keep in sync.
 */
function tooth(p: number, rake = 0.22) {
  const f = frac(p)
  return f < rake ? f / rake : (1 - f) / (1 - rake)
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

interface GridSpec {
  around: number
  along: number
  /** (u in 0..1 around, v in 0..1 along) → [radius, y] */
  fn: (u: number, v: number) => [number, number]
  /** Flip winding for surfaces viewed from inside. */
  inward?: boolean
}

/** Closed (wrapping) parametric surface of revolution-ish shape. */
function grid(spec: GridSpec, pos: number[], idx: number[], uvs: number[]) {
  const start = pos.length / 3
  for (let j = 0; j <= spec.along; j++) {
    const v = j / spec.along
    for (let i = 0; i < spec.around; i++) {
      const u = i / spec.around
      const [r, y] = spec.fn(u, v)
      const phi = u * Math.PI * 2
      pos.push(r * Math.sin(phi), y, r * Math.cos(phi))
      uvs.push(u, v)
    }
  }
  for (let j = 0; j < spec.along; j++) {
    for (let i = 0; i < spec.around; i++) {
      const i2 = (i + 1) % spec.around
      const a = start + j * spec.around + i
      const b = start + j * spec.around + i2
      const c = start + (j + 1) * spec.around + i2
      const d = start + (j + 1) * spec.around + i
      if (spec.inward) idx.push(a, d, b, b, d, c)
      else idx.push(a, b, d, b, c, d)
    }
  }
  return start
}

/** Flat annulus between two rings that share the same angular sampling. */
function annulus(
  around: number,
  outer: (u: number) => [number, number],
  inner: (u: number) => [number, number],
  up: boolean,
  pos: number[],
  idx: number[],
  uvs: number[],
) {
  const start = pos.length / 3
  for (let i = 0; i < around; i++) {
    const u = i / around
    const phi = u * Math.PI * 2
    const [ro, yo] = outer(u)
    const [ri, yi] = inner(u)
    pos.push(ro * Math.sin(phi), yo, ro * Math.cos(phi))
    pos.push(ri * Math.sin(phi), yi, ri * Math.cos(phi))
    uvs.push(u, 1, u, 0)
  }
  for (let i = 0; i < around; i++) {
    const i2 = (i + 1) % around
    const o1 = start + i * 2
    const n1 = o1 + 1
    const o2 = start + i2 * 2
    const n2 = o2 + 1
    if (up) idx.push(o1, o2, n1, o2, n2, n1)
    else idx.push(o1, n1, o2, o2, n1, n2)
  }
}

function finish(pos: number[], idx: number[], uvs: number[]) {
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2))
  g.setIndex(idx)
  g.computeVertexNormals()
  g.computeBoundingSphere()
  return g
}

export function innerBurrGeometry(detail = 1) {
  const H = 2.3
  const around = Math.round(336 * detail)
  const along = Math.round(72 * detail)
  const pos: number[] = []
  const idx: number[] = []
  const uvs: number[] = []

  const radius = (u: number, v: number) => {
    const y = v * H
    const base = 2.05 - 1.08 * Math.pow(v, 1.12)
    const fineDepth = 0.075 * (1 - smooth(0.55, 0.95, v))
    const bladeDepth = 0.34 * smooth(0.25, 0.8, v)
    const fine = tooth(u * 28 + y * 0.42)
    const blade = tooth(u * 6 - y * 0.32, 0.3)
    return base - fineDepth * (1 - fine) - bladeDepth * (1 - blade)
  }

  grid({ around, along, fn: (u, v) => [radius(u, v), v * H] }, pos, idx, uvs)
  // Top face down to the shaft bore, bottom face with a shallow hub.
  annulus(around, (u) => [radius(u, 1), H], () => [0.32, H], true, pos, idx, uvs)
  annulus(around, (u) => [radius(u, 0), 0], () => [0.32, 0], false, pos, idx, uvs)
  return finish(pos, idx, uvs)
}

/** Stationary outer burr: a ring with 42 slanted internal teeth. */
export function outerBurrGeometry(detail = 1) {
  const H = 1.45
  const around = Math.round(294 * detail)
  const along = Math.round(10 * detail)
  const pos: number[] = []
  const idx: number[] = []
  const uvs: number[] = []
  const rOut = 2.36
  const inner = (u: number, v: number) => 2.12 + 0.06 * v + 0.07 * (1 - tooth(u * 42 + v * 0.35, 0.6))

  grid({ around, along: 1, fn: (_u, v) => [rOut, v * H] }, pos, idx, uvs)
  grid({ around, along, fn: (u, v) => [inner(u, v), v * H], inward: true }, pos, idx, uvs)
  annulus(around, () => [rOut, H], (u) => [inner(u, 1), H], true, pos, idx, uvs)
  annulus(around, () => [rOut, 0], (u) => [inner(u, 0), 0], false, pos, idx, uvs)
  return finish(pos, idx, uvs)
}

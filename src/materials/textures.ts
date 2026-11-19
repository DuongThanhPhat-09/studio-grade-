import * as THREE from 'three'
import { fbm, vnoise } from './noise'

/**
 * Procedural surface textures. Generated once at load, on the CPU, at sizes chosen
 * for what the camera actually resolves. Nothing here is decorative noise: each map
 * corresponds to a physical process — bead blasting, knurling, brushing, oiling,
 * laser etching.
 */

const frac = (x: number) => x - Math.floor(x)
const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const sstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

function dataTexture(data: Uint8Array, w: number, h: number, srgb = false, repeat = true) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat)
  t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 8
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.needsUpdate = true
  return t
}

/** Central-difference normal map from a periodic height field. */
function heightToNormal(hgt: Float32Array, w: number, h: number, strength: number) {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = hgt[y * w + ((x - 1 + w) % w)]
      const r = hgt[y * w + ((x + 1) % w)]
      const d = hgt[((y - 1 + h) % h) * w + x]
      const u = hgt[((y + 1) % h) * w + x]
      let nx = (l - r) * strength
      let ny = (d - u) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * w + x) * 4
      out[i] = (nx * 0.5 + 0.5) * 255
      out[i + 1] = (ny * 0.5 + 0.5) * 255
      out[i + 2] = (nz * 0.5 + 0.5) * 255
      out[i + 3] = 255
    }
  }
  return out
}

function grey(values: Float32Array) {
  const out = new Uint8Array(values.length * 4)
  for (let i = 0; i < values.length; i++) {
    const v = clamp01(values[i]) * 255
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Bead-blasted aluminium: fine isotropic dimpling + slow roughness drift */
/* ------------------------------------------------------------------ */
export function beadBlast(size = 512) {
  const hgt = new Float32Array(size * size)
  const rough = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      hgt[y * size + x] = fbm(u, v, 96, 96, 2, 3) * 0.8 + vnoise(u * 220, v * 220, 220, 220, 9) * 0.2
      // Blasting is a uniform process: the variation is barely there — a faint
      // drift in density, and fine sparkle where single impacts burnished the surface.
      const broad = fbm(u, v, 3, 3, 4, 11)
      const fine = vnoise(u * 160, v * 160, 160, 160, 5)
      rough[y * size + x] = 0.5 + (broad - 0.5) * 0.035 + (fine - 0.5) * 0.09
    }
  }
  return {
    normal: dataTexture(heightToNormal(hgt, size, size, 2.2), size, size),
    roughness: dataTexture(grey(rough), size, size),
  }
}

/* ------------------------------------------------------------------ */
/* Diamond knurl: truncated pyramids, 4 × 4 cells per tile               */
/* ------------------------------------------------------------------ */
export const KNURL_CELLS_PER_TILE = 4

export function knurl(size = 512) {
  const n = KNURL_CELLS_PER_TILE
  const hgt = new Float32Array(size * size)
  const rough = new Float32Array(size * size)
  const tri = (t: number) => 1 - Math.abs(2 * frac(t) - 1)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * n
      const v = (y / size) * n
      const a = tri(u + v)
      const b = tri(u - v)
      let h = Math.min(a, b)
      // Real knurls are rolled, not cut: crests are flattened, roots are rounded.
      h = Math.min(h, 0.78) / 0.78
      h = sstep(0, 1, h)
      hgt[y * size + x] = h
      const wear = fbm(x / size, y / size, 6, 6, 3, 21)
      // Crests are burnished by hands; roots keep the anodised matte.
      rough[y * size + x] = 0.82 - h * 0.18 + (wear - 0.5) * 0.12
    }
  }
  return {
    normal: dataTexture(heightToNormal(hgt, size, size, 9), size, size),
    roughness: dataTexture(grey(rough), size, size),
  }
}

/* ------------------------------------------------------------------ */
/* Brushed stainless: long streaks along u                              */
/* ------------------------------------------------------------------ */
export function brushed(size = 512) {
  const hgt = new Float32Array(size * size)
  const rough = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size
      const v = y / size
      const streak = fbm(u, v, 2, 220, 3, 31)
      hgt[y * size + x] = streak
      rough[y * size + x] = 0.55 + (streak - 0.5) * 0.35 + (fbm(u, v, 3, 3, 3, 33) - 0.5) * 0.12
    }
  }
  return {
    normal: dataTexture(heightToNormal(hgt, size, size, 1.2), size, size),
    roughness: dataTexture(grey(rough), size, size),
  }
}

/* ------------------------------------------------------------------ */
/* Wood grain, neutral. Growth rings around a slightly tilted pith axis */
/* give the straight-to-cathedral figure of turned stock. The species   */
/* (walnut, oak, blackwood) is a tint on the material, so it can blend. */
/* ------------------------------------------------------------------ */
export function woodGrain(w = 1024, h = 512) {
  const color = new Uint8Array(w * h * 4)
  const rough = new Float32Array(w * h)
  const hgt = new Float32Array(w * h)
  const r = 0.78
  const height = 2.6
  const pith = { x: 5.2, z: 1.1, tilt: 0.08 }
  const dark = [92, 88, 85]
  const mid = [178, 172, 166]
  const light = [236, 232, 226]
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w
      const v = y / h
      const phi = u * Math.PI * 2
      const px = r * Math.sin(phi)
      const pz = r * Math.cos(phi)
      const py = v * height
      const dx = px - (pith.x + py * pith.tilt)
      const dz = pz - pith.z
      const warp = (fbm(u, v, 4, 2, 4, 41) - 0.5) * 0.9
      const ring = frac(Math.hypot(dx, dz) * 4.2 + warp)
      // Earlywood → latewood: soft rise, sharp dark boundary.
      const late = sstep(0.62, 0.96, ring)
      const figure = fbm(u, v, 6, 3, 4, 43)
      const pore = vnoise(u * 900, v * 40, 900, 40, 47)
      const poreMask = sstep(0.72, 0.9, pore)
      let cr = mid[0] + (light[0] - mid[0]) * (figure - 0.3) - (mid[0] - dark[0]) * late * 0.9
      let cg = mid[1] + (light[1] - mid[1]) * (figure - 0.3) - (mid[1] - dark[1]) * late * 0.9
      let cb = mid[2] + (light[2] - mid[2]) * (figure - 0.3) - (mid[2] - dark[2]) * late * 0.9
      cr *= 1 - poreMask * 0.35
      cg *= 1 - poreMask * 0.38
      cb *= 1 - poreMask * 0.4
      const i = (y * w + x) * 4
      color[i] = clamp01(cr / 255) * 255
      color[i + 1] = clamp01(cg / 255) * 255
      color[i + 2] = clamp01(cb / 255) * 255
      color[i + 3] = 255
      rough[y * w + x] = 0.5 + poreMask * 0.3 + late * 0.06
      hgt[y * w + x] = -poreMask * 0.6 - late * 0.15
    }
  }
  return {
    map: dataTexture(color, w, h, true),
    roughness: dataTexture(grey(rough), w, h),
    normal: dataTexture(heightToNormal(hgt, w, h, 1.4), w, h),
  }
}

/* ------------------------------------------------------------------ */
/* Laser-etched marks, drawn with canvas text then baked into maps.    */
/* ------------------------------------------------------------------ */

const SANS = '"Instrument Sans Variable", "Helvetica Neue", Arial, sans-serif'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  return [c, c.getContext('2d')!] as const
}

function canvasTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = 8
  t.wrapS = THREE.RepeatWrapping
  t.wrapT = THREE.ClampToEdgeWrapping
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  return t
}

function spacedText(ctx: CanvasRenderingContext2D, text: string, cx: number, cy: number, tracking: number) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (text.length - 1)
  let x = cx - total / 2
  ctx.textBaseline = 'middle'
  ;[...text].forEach((ch, i) => {
    ctx.fillText(ch, x, cy)
    x += widths[i] + tracking
  })
}

/**
 * Adjustment dial. `vFrom..vTo` is the band of the lathe UV occupied by the
 * dial's outer face; the anodised base colour is baked into the map so the
 * engraving can read lighter than the surface around it.
 */
export function dialMarks(vFrom: number, vTo: number, w = 2048, h = 512) {
  const [c, ctx] = canvas(w, h)
  ctx.fillStyle = '#232325'
  ctx.fillRect(0, 0, w, h)
  // Canvas y grows downward; texture v grows upward (flipY).
  const yTop = (1 - vTo) * h
  const yBot = (1 - vFrom) * h
  const band = yBot - yTop
  ctx.fillStyle = '#b4b0a8'
  const steps = 30
  for (let i = 0; i < steps; i++) {
    // u = 0.5 faces the camera at rest; 0 sits there.
    const x = (0.5 + i / steps) % 1 * w
    const major = i % 5 === 0
    const len = band * (major ? 0.36 : 0.2)
    const tw = major ? 3 : 2
    ctx.fillRect(x - tw / 2, yTop + band * 0.08, tw, len)
    if (major) {
      ctx.font = `600 ${Math.round(band * 0.22)}px ${SANS}`
      spacedText(ctx, String(i), x, yTop + band * 0.66, 2)
    }
  }
  return canvasTexture(c, true)
}

/**
 * Body: bead-blasted base colour with the etched wordmark baked in.
 * `vAt(y)` maps a body height (cm) to the lathe UV v.
 */
export function bodyMark(vAt: (y: number) => number, circumference: number, w = 2048, h = 2048) {
  const [c, ctx] = canvas(w, h)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, w, h)
  const pxPerCmU = w / circumference
  const yMid = (1 - vAt(13.5)) * h
  const yUnit = (1 - vAt(13.6)) * h - yMid // canvas px per 0.1 cm (negative = upward)
  const capPx = Math.abs(yUnit) * 2.6 // ~2.6 mm cap height
  // Canvas px are not square in UV space: draw in cm, then scale v.
  const scaleY = Math.abs(yUnit) * 10 / pxPerCmU
  ctx.save()
  ctx.translate(0.5 * w, yMid)
  ctx.scale(1, scaleY)
  ctx.fillStyle = '#86847f'
  ctx.font = `600 ${Math.round(capPx / scaleY / 0.72)}px ${SANS}`
  spacedText(ctx, 'ORME', 0, 0, (capPx / scaleY) * 0.62)
  ctx.restore()
  return canvasTexture(c, true)
}


/**
 * Small, dependency-free noise toolkit for texture generation.
 * All functions are periodic when given a `period`, so textures tile without seams.
 */

function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h = h ^ (h >>> 16)
  return (h >>> 0) / 4294967295
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const mod = (a: number, n: number) => ((a % n) + n) % n

/** Periodic value noise in [0, 1]. */
export function vnoise(x: number, y: number, px: number, py: number, seed = 1) {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const xf = x - xi
  const yf = y - yi
  const x0 = mod(xi, px)
  const x1 = mod(xi + 1, px)
  const y0 = mod(yi, py)
  const y1 = mod(yi + 1, py)
  const u = fade(xf)
  const v = fade(yf)
  const a = hash(x0, y0, seed)
  const b = hash(x1, y0, seed)
  const c = hash(x0, y1, seed)
  const d = hash(x1, y1, seed)
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

/** Periodic fractal noise; `u, v` in 0..1 tile space, `freq` cells across. */
export function fbm(u: number, v: number, freqX: number, freqY: number, octaves = 4, seed = 1) {
  let amp = 0.5
  let sum = 0
  let norm = 0
  let fx = freqX
  let fy = freqY
  for (let o = 0; o < octaves; o++) {
    sum += amp * vnoise(u * fx, v * fy, fx, fy, seed + o * 17)
    norm += amp
    amp *= 0.5
    fx *= 2
    fy *= 2
  }
  return sum / norm
}


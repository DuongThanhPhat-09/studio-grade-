import { useSyncExternalStore } from 'react'

/**
 * Adaptive quality.
 *
 * The starting tier is estimated from what the device tells us (GPU string, DPR,
 * viewport, cores, memory); after that, observed frame timing decides. Tiers step
 * down quickly when frames are slow and step up only cautiously, so the image does
 * not oscillate. Every setting is something the eye actually notices less than
 * stutter: AO first, then shadow and reflection resolution, particles, DPR.
 */

export type Tier = 'high' | 'medium' | 'low'

export interface Quality {
  tier: Tier
  dprCap: number
  ao: boolean
  shadowMap: number
  contactRes: number
  /** Contact shadows re-render every N frames. */
  contactEvery: number
  envRes: number
  particles: number
  beans: number
  grain: boolean
  /**
   * Inside the Grind. The story is identical at every tier; what scales is detail:
   * macro burr tessellation, grounds counts, debris, depth of field (0 = none: the
   * low tier relies on the macro fog falloff instead).
   */
  macro: { around: number; along: number }
  journey: { fall: number; carpet: number; patch: number; debris: number }
  dof: number
  /** Pixel-ratio cap during the film: macro frames are mostly depth of field and grain. */
  filmDpr: number
  /** Geometry detail, fixed at first build. */
  detail: number
}

const TIERS: Record<Tier, Omit<Quality, 'tier' | 'detail'>> = {
  high: {
    dprCap: 2, ao: true, shadowMap: 2048, contactRes: 1024, contactEvery: 1, envRes: 512, particles: 1600, beans: 84, grain: true,
    macro: { around: 1280, along: 230 }, journey: { fall: 880, carpet: 1700, patch: 1.2, debris: 200 }, dof: 1, filmDpr: 1.5,
  },
  medium: {
    dprCap: 1.6, ao: false, shadowMap: 1024, contactRes: 512, contactEvery: 1, envRes: 256, particles: 900, beans: 64, grain: true,
    macro: { around: 740, along: 140 }, journey: { fall: 520, carpet: 1150, patch: 1.0, debris: 130 }, dof: 0.75, filmDpr: 1.2,
  },
  low: {
    dprCap: 1.25, ao: false, shadowMap: 512, contactRes: 256, contactEvery: 2, envRes: 256, particles: 420, beans: 44, grain: false,
    macro: { around: 520, along: 110 }, journey: { fall: 260, carpet: 560, patch: 0.75, debris: 70 }, dof: 0, filmDpr: 1,
  },
}

const ORDER: Tier[] = ['low', 'medium', 'high']

function gpuString() {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    if (!gl) return ''
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    const s = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return s
  } catch {
    return ''
  }
}

/** Initial guess. Deliberately optimistic on desktops: the monitor corrects within seconds. */
export function estimateTier(): { tier: Tier; reason: string } {
  const gpu = gpuString()
  const coarse = window.matchMedia('(pointer: coarse)').matches
  const dpr = window.devicePixelRatio || 1
  const cores = navigator.hardwareConcurrency || 4
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8
  const pixels = window.innerWidth * window.innerHeight * Math.min(dpr, 2) ** 2
  const discrete = /nvidia|geforce|rtx|radeon rx|radeon pro|apple m\d|apple gpu/i.test(gpu) && !coarse
  const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu)
  const integrated = /intel|iris|uhd|adreno|mali|powervr/i.test(gpu)

  let tier: Tier
  if (software) tier = 'low'
  else if (coarse) tier = cores >= 6 && mem >= 4 && dpr <= 3 ? 'medium' : 'low'
  else if (discrete) tier = 'high'
  // Integrated GPUs start at medium: full-res AO at retina sizes is their fill-rate wall.
  else if (integrated) tier = pixels > 9_000_000 ? 'low' : 'medium'
  else tier = pixels > 6_000_000 || cores <= 4 ? 'medium' : 'high'
  return { tier, reason: `${gpu || 'unknown gpu'} · dpr ${dpr} · ${cores} cores · ${mem} GB` }
}

let detail = 1
let current: Quality

export function initQuality() {
  const est = estimateTier()
  // Dev only: ?tier=high|medium|low pins the starting tier for profiling.
  const forced = import.meta.env.DEV ? (new URLSearchParams(location.search).get('tier') as Tier | null) : null
  const tier = forced && forced in TIERS ? forced : est.tier
  if (import.meta.env.DEV) Object.assign(window, { __gpu: est.reason })
  detail = tier === 'low' ? 0.6 : tier === 'medium' ? 0.8 : 1
  current = make(tier)
  return current
}

function make(tier: Tier): Quality {
  return { tier, detail, ...TIERS[tier] }
}

const listeners = new Set<() => void>()
/**
 * A tier change reallocates render targets and rebuilds geometry: a stall of a few
 * frames. While held (Inside the Grind, past its blackout) the monitor's decisions wait
 * and are applied at the next moment nobody can see one.
 */
let held = false
let pending: Tier | null = null
export const quality = {
  get: () => current,
  set(tier: Tier) {
    if (current.tier === tier) return
    current = make(tier)
    listeners.forEach((l) => l())
  },
  step(dir: -1 | 1) {
    const base = pending ?? current.tier
    const i = ORDER.indexOf(base) + dir
    if (i < 0 || i >= ORDER.length) return
    if (held) pending = ORDER[i]
    else quality.set(ORDER[i])
  },
  hold(on: boolean) {
    held = on
    if (!on && pending) {
      const t = pending
      pending = null
      quality.set(t)
    }
  },
  pending: () => pending,
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

export function useQuality() {
  return useSyncExternalStore(quality.subscribe, quality.get, quality.get)
}

/**
 * Frame-time monitor. Feeds 1-second windows; two slow windows in a row step
 * down, eight fast windows in a row step up (at most once per session per tier).
 */
export function createFrameMonitor() {
  let acc = 0
  let frames = 0
  let slow = 0
  let fast = 0
  let warm = 0
  // A tier we had to leave for being slow is never re-entered: no oscillation.
  const failed = new Set<Tier>()
  return {
    /** Last average frame time (ms), for diagnostics. */
    last: 0,
    tick(dtMs: number, hidden: boolean) {
      if (hidden || dtMs > 250) return // tab switches, breakpoints
      acc += dtMs
      frames++
      if (acc < 1000) return
      const avg = acc / frames
      this.last = avg
      acc = 0
      frames = 0
      if (++warm < 3) return // shader warm-up, first layout
      if (avg > 21) {
        slow++
        fast = 0
        if (slow >= 2) {
          failed.add(quality.pending() ?? quality.get().tier)
          quality.step(-1)
          slow = 0
        }
      } else if (avg < 8) {
        fast++
        slow = 0
        const next = ORDER[ORDER.indexOf(quality.pending() ?? quality.get().tier) + 1]
        if (fast >= 8 && next && !failed.has(next)) {
          quality.step(1)
          fast = 0
        }
      } else {
        slow = 0
        fast = 0
      }
    },
  }
}

/** Portrait-ish viewports get the mobile choreography and layouts. */
export const isPortrait = (w = window.innerWidth, h = window.innerHeight) => w / h < 0.9 || w < 720

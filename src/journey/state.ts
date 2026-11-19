import type { CueName } from './timeline'

/**
 * Journey runtime (mutable, never React state) and the per-frame "journey frame":
 * everything the Director resolves for the film each frame, read by the scene.
 */
export const journey = {
  /** Film time (s). */
  t: 0,
  /** Playback rate (dev/testing). */
  speed: 1,
  paused: false,
  /** Reduced motion: the film plays as composed stills. */
  stills: false,
  still: 0,
  stillSince: 0,
  /** 'play' → 'hero' (title on) → 'leaving' (veil fading before handing back). */
  phase: 'off' as 'off' | 'play' | 'hero' | 'leaving',
  /** Cues fired in this run, in order (tests and sound design). */
  fired: [] as CueName[],
  /** Set when a snapshot of the presented frame is wanted (reduced-motion crossfades). */
  snapshot: null as null | ((url: string) => void),
  /** Registered by the UI: shows a snapshot over the canvas and fades it out. */
  crossfade: null as null | ((url: string) => void),
  /** A still change is waiting for its snapshot. */
  pendingStill: false,
  /** How the last run ended. */
  exit: 'skip' as 'skip' | 'continue',
  /** Watch again requested. */
  restart: false,
  /** Number of runs started this session. */
  runs: 0,
}

export type V3 = [number, number, number]

/** Resolved state for the current frame. */
export const jf = {
  active: false,
  t: 0,
  tau: 0,
  /** Burr / crank angle (rad). */
  theta: 0,
  /** 0 product scale … 1 macro. */
  macro: 0,
  /** Use the GPU-evaluated macro burr instead of the meshes. */
  fine: false,
  /** Macro surface detail fade-in after the swap. */
  detail: 0,
  /** Camera, resolved. */
  cam: [0, 0, 0] as V3,
  target: [0, 0, 0] as V3,
  dist: 60,
  /** Subject the lens is focused on and the light follows. */
  subject: [0, 0, 0] as V3,
  focus: 60,
  focusRange: 30,
  bokeh: 0,
  /** Cutaway of the outer ring: wedge centre angle and half-width (rad), edge-line strength. */
  cut: { center: 0, half: 0, edge: 0 },
  /** Shell: X-ray plane, edge line, opacity per group, near-camera fade (cm). */
  shellAlpha: 1,
  cupAlpha: 1,
  near: [0, 0] as [number, number],
  /** Macro practicals. */
  probe: 0,
  rim: 0,
  /** Hopper pile visible (0..1) — it fades as the lens enters the throat. */
  pile: 1,
}

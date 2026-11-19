import { store } from '../state/store'
import { grindMath } from '../content/copy'
import { clamp, smoothstep } from '../animation/motion'

/**
 * Grind simulator timeline. Deterministic, time-based, no physics:
 *
 *   loading   beans pour into the hopper            1.3 s
 *   grinding  crank turns, burr spins, grounds fall 6–9 s (time-lapse)
 *   done      heap settled, readouts final
 *
 * The real grind would take 30–60 s; it is shown as a labelled time-lapse.
 * The crank's on-screen speed is capped so it never strobes, while the
 * readouts report the real-equivalent turns, grams and seconds.
 */

const LOAD_MS = 1300
const REAL_RPS = 1.3 // a comfortable hand-cranking pace

export const sim = {
  /** 0..1 beans pouring in. */
  load: 0,
  /** 0..1 through the grind. */
  progress: 0,
  /** 0..1 grounds flow intensity. */
  flow: 0,
  /** Grams in the cup. */
  grams: 0,
  /** Visual crank angle accumulated by the simulator (rad). */
  crank: 0,
  turns: 0,
  turnsTotal: 0,
  seconds: 0,
  lapse: 1,
  /** Beans visible at all (0..1). */
  beans: 0,
}

export function updateGrind(now: number, dt: number, inBeat: boolean) {
  const s = store.get()
  const g = s.grind

  // Leaving the chapter resets it, so returning always starts clean.
  if (!inBeat) {
    if (g.phase !== 'idle') store.set({ grind: { ...g, phase: 'idle' } })
    sim.load = sim.progress = sim.flow = sim.grams = sim.beans = sim.turns = sim.seconds = 0
    return
  }

  const turnsTotal = g.dose / grindMath.gramsPerTurn
  const realSeconds = turnsTotal / REAL_RPS
  const duration = clamp(realSeconds / 3.2, 6, 9)
  sim.turnsTotal = turnsTotal
  sim.lapse = realSeconds / duration

  if (g.phase === 'idle') {
    sim.load = sim.progress = sim.flow = sim.grams = sim.turns = sim.seconds = 0
    sim.beans = 0
    return
  }

  if (g.phase === 'loading') {
    sim.load = clamp((now - g.startedAt) / LOAD_MS)
    sim.beans = 1
    sim.progress = 0
    if (sim.load >= 1) store.set({ grind: { ...g, phase: 'grinding', startedAt: now } })
  } else if (g.phase === 'grinding') {
    sim.load = 1
    sim.beans = 1
    sim.progress = clamp((now - g.startedAt) / (duration * 1000))
    if (sim.progress >= 1) store.set({ grind: { ...g, phase: 'done' } })
  } else {
    sim.load = 1
    sim.progress = 1
    sim.beans = 0
  }

  const p = sim.progress
  const running = g.phase === 'grinding'
  // Spin-up and run-down, so the crank has weight.
  const envelope = running ? smoothstep(0, 0.06, p) * (1 - smoothstep(0.93, 1, p)) : 0
  const visualRps = Math.min(turnsTotal / duration, 2.0)
  sim.crank -= visualRps * Math.PI * 2 * dt * envelope
  sim.flow = running ? smoothstep(0.02, 0.1, p) * (1 - smoothstep(0.95, 1, p)) : 0
  sim.grams = p * g.dose
  sim.turns = p * turnsTotal
  sim.seconds = p * realSeconds
}

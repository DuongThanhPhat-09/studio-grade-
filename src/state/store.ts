import { useSyncExternalStore } from 'react'
import { methodById, type BodyFinish, type BurrFinish, type KnobWood, type MethodId, type PartId } from '../content/copy'

/**
 * Interactive state: what the visitor has chosen. Changes at human speed (clicks),
 * so React may subscribe to it — but the render loop reads it directly with get().
 * Per-frame values live in `runtime` and `stage`, never here.
 */

export type Mode = 'film' | 'inspect' | 'hero' | 'journey'
export type GrindPhase = 'idle' | 'loading' | 'grinding' | 'done'

export interface AppState {
  mode: Mode
  /** Inspect: selected and hovered parts. */
  part: PartId | null
  hover: PartId | null
  config: { body: BodyFinish; burr: BurrFinish; knob: KnobWood }
  /** Which configurator group the visitor is pointing at — the camera leans toward it. */
  configFocus: 'body' | 'burr' | 'knob' | null
  /** Grind simulator. `method` is null once the dial is turned by hand. */
  method: MethodId | null
  clicks: number
  grind: { phase: GrindPhase; startedAt: number; dose: number }
  /** Coffee Lab. */
  labMethod: MethodId
  labDose: number
}

const initial: AppState = {
  mode: 'film',
  part: null,
  hover: null,
  config: { body: 'silver', burr: 'gold', knob: 'walnut' },
  configFocus: null,
  method: 'v60',
  clicks: methodById.v60.clicks,
  grind: { phase: 'idle', startedAt: 0, dose: methodById.v60.dose },
  labMethod: 'v60',
  labDose: methodById.v60.dose,
}

let state: AppState = initial
const listeners = new Set<() => void>()

export const store = {
  get: () => state,
  set(patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) {
    const p = typeof patch === 'function' ? patch(state) : patch
    state = { ...state, ...p }
    listeners.forEach((l) => l())
  },
  subscribe(l: () => void) {
    listeners.add(l)
    return () => {
      listeners.delete(l)
    }
  },
}

/** Select a slice. Selectors must return primitives or existing references. */
export function useStore<T>(select: (s: AppState) => T): T {
  return useSyncExternalStore(store.subscribe, () => select(state), () => select(state))
}

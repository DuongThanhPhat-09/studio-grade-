import { store } from '../state/store'
import { emit, runtime } from '../state/runtime'
import { journey } from './state'

/**
 * Entering and leaving the film. The film is a mode like Inspect: scroll locks, the
 * site's copy steps aside, the Director hands the camera over — but it is entered by
 * the camera, not by a panel: nothing opens, the lights simply go down.
 */

let veilEl: HTMLElement | null = null
export const registerVeil = (el: HTMLElement | null) => {
  veilEl = el
}

function veil(on: boolean) {
  veilEl?.classList.toggle('is-on', on)
}

export function enterJourney() {
  const s = store.get()
  if (s.mode !== 'film') return
  if (runtime.reducedMotion) {
    // No flight in: a short dip to the first still.
    veil(true)
    setTimeout(() => {
      store.set({ mode: 'journey', hover: null, configFocus: null })
      setTimeout(() => veil(false), 120)
    }, 380)
    return
  }
  store.set({ mode: 'journey', hover: null, configFocus: null })
}

/**
 * Leave the film.
 *  - 'continue' (from the hero frame): the site's camera travels back from the hero shot.
 *  - 'skip' (mid-film, from any scale): a short veil, and the site's camera cuts back.
 */
export function leaveJourney(how: 'skip' | 'continue') {
  if (store.get().mode !== 'journey' || journey.phase === 'leaving') return
  journey.exit = how
  if (how === 'continue' && !runtime.reducedMotion) {
    store.set({ mode: 'film' })
    return
  }
  journey.phase = 'leaving'
  emit()
  veil(true)
  setTimeout(() => {
    runtime.snapCamera = true
    store.set({ mode: 'film' })
    // Two frames for the site's camera to land before the veil lifts.
    requestAnimationFrame(() => requestAnimationFrame(() => veil(false)))
  }, 420)
}

/** Watch again: back under the lights-down, from the beginning. */
export function replayJourney() {
  if (store.get().mode !== 'journey') return
  journey.restart = true
}

import type Lenis from 'lenis'
import { beatIndex, type BeatId } from '../content/copy'
import { runtime } from '../state/runtime'

/** Module-level handle on the smooth scroller, so buttons and modes can drive it. */
let lenis: Lenis | null = null
export const setLenis = (l: Lenis | null) => (lenis = l)

/** Scroll to the hold position of a beat (slightly past its start, where the camera rests). */
export function scrollToBeat(id: BeatId, opts: { immediate?: boolean } = {}) {
  const el = document.getElementById(`t-${id}`)
  if (!el) return
  const y = el.offsetTop + el.offsetHeight * (id === 'final' ? 0 : 0.12)
  if (lenis) {
    const distance = Math.abs(beatIndex[id] - runtime.scroll)
    lenis.scrollTo(y, {
      immediate: opts.immediate || runtime.reducedMotion,
      // Long jumps travel faster per beat; every move keeps the same decelerating feel.
      duration: Math.min(3.2, 1.2 + distance * 0.22),
      easing: (t: number) => 1 - Math.pow(1 - t, 4),
      force: true,
    })
  } else window.scrollTo({ top: y, behavior: runtime.reducedMotion ? 'auto' : 'smooth' })
}

export function lockScroll(locked: boolean) {
  if (locked) lenis?.stop()
  else lenis?.start()
  document.documentElement.classList.toggle('is-modal', locked)
}

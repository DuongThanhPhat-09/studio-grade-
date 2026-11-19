import { useEffect } from 'react'
import Lenis from 'lenis'
import { emit, runtime, sectionForScroll, subscribe } from '../state/runtime'
import { store } from '../state/store'
import { lockScroll, setLenis } from './scroller'

/**
 * Smooth scrolling + mapping of scroll offset to beat units.
 * Lenis gives the page a little inertia so scroll-scrubbed motion doesn't
 * stutter on notched wheels. Disabled under reduced motion. Modes lock it.
 */
export function useSmoothScroll() {
  useEffect(() => {
    history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)

    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-track]'))
    let tops: number[] = []
    const measure = () => {
      tops = els.map((el) => el.offsetTop)
    }
    measure()

    const toBeats = (y: number) => {
      for (let i = 0; i < tops.length - 1; i++) {
        if (y < tops[i + 1]) return i + (y - tops[i]) / (tops[i + 1] - tops[i])
      }
      return tops.length - 1
    }

    const update = (y: number) => {
      runtime.scroll = Math.max(0, toBeats(y))
      const active = sectionForScroll(runtime.scroll)
      if (active !== runtime.activeSection) {
        runtime.activeSection = active
        emit()
      }
    }

    const lenis = runtime.reducedMotion
      ? null
      : new Lenis({ lerp: 0.085, wheelMultiplier: 0.85, touchMultiplier: 1.1, smoothWheel: true })
    setLenis(lenis)
    if (import.meta.env.DEV) Object.assign(window, { __lenis: lenis, __runtime: runtime })

    let raf = 0
    const loop = (t: number) => {
      lenis?.raf(t)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    const onScroll = () => update(window.scrollY)
    if (lenis) lenis.on('scroll', ({ scroll }: { scroll: number }) => update(scroll))
    else window.addEventListener('scroll', onScroll, { passive: true })

    // Hold the page still until the studio is lit.
    if (!runtime.ready) lenis?.stop()
    document.documentElement.classList.toggle('is-locked', !runtime.ready)
    const unsubReady = subscribe(() => {
      if (runtime.ready && document.documentElement.classList.contains('is-locked')) {
        if (store.get().mode === 'film') lenis?.start()
        document.documentElement.classList.remove('is-locked')
      }
    })

    // Modes (Inspect, Your Orme) take the stage; the film waits underneath.
    let lastMode = store.get().mode
    const unsubMode = store.subscribe(() => {
      const m = store.get().mode
      if (m === lastMode) return
      lastMode = m
      lockScroll(m !== 'film')
    })

    const onResize = () => {
      measure()
      update(lenis ? lenis.scroll : window.scrollY)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(raf)
      lenis?.destroy()
      setLenis(null)
      unsubReady()
      unsubMode()
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onResize)
    }
  }, [])
}

import { useEffect, useSyncExternalStore } from 'react'
import { runtime, subscribe } from './runtime'
import { store } from './store'
import { methods } from '../content/copy'
import { leaveJourney } from '../journey/control'
import { journey } from '../journey/state'

/** Subscribe React to a coarse runtime value (section index, ready flag). */
export function useRuntime<T>(select: () => T): T {
  return useSyncExternalStore(subscribe, select, select)
}

const TAU = Math.PI * 2

/**
 * Pointer input. Records intent only; the Director applies it with springs.
 * A canvas drag means different things depending on context (runtime.dragMode):
 *   yaw   — turn the product, with inertia
 *   orbit — inspect mode: yaw + camera elevation
 *   crank — X-ray chapter: turn the crank itself, which keeps spinning like a flywheel
 * The dial, when grabbed directly, moves through its 30 detents.
 */
export function useInput() {
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const fine = window.matchMedia('(pointer: fine)')
    runtime.reducedMotion = mq.matches
    runtime.pointer.fine = fine.matches
    const onMq = () => (runtime.reducedMotion = mq.matches)
    mq.addEventListener('change', onMq)

    const html = document.documentElement

    const onMove = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') {
        runtime.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
        runtime.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
        runtime.pointer.active = true
      }

      // The dial: one detent per 14 px.
      const dh = runtime.dialHand
      if (dh.active) {
        const clicks = Math.max(4, Math.min(60, dh.startClicks + Math.round((e.clientX - dh.startX) / 14)))
        if (clicks !== store.get().clicks) {
          store.set({ clicks, method: methods.find((m) => m.clicks === clicks)?.id ?? null })
          navigator.vibrate?.(3)
        }
        return
      }

      const now = performance.now()
      const ch = runtime.crankHand
      if (ch.active) {
        const dx = e.clientX - ch.lastX
        const dtS = Math.max(1, now - ch.lastT) / 1000
        // Dragging right turns it clockwise seen from above — the way a hand pushes.
        const rad = -(dx / Math.min(window.innerWidth, 900)) * TAU * 1.3
        ch.angle += rad
        ch.total += Math.abs(rad) / TAU
        ch.velocity = ch.velocity * 0.6 + (rad / dtS) * 0.4
        ch.lastX = e.clientX
        ch.lastT = now
        return
      }

      const d = runtime.drag
      if (!d.active) return
      const dx = e.clientX - d.lastX
      const dy = e.clientY - d.lastY
      const dtS = Math.max(1, now - d.lastT) / 1000
      d.moved += Math.abs(dx) + Math.abs(dy)
      // Resistance: the product turns less than the finger travels.
      const rx = (dx / window.innerWidth) * Math.PI * 1.4
      d.x += rx
      d.vx = d.vx * 0.6 + (rx / dtS) * 0.4
      if (runtime.dragMode === 'orbit') {
        const ry = (dy / window.innerHeight) * Math.PI * 0.6
        d.y += ry
        d.vy = d.vy * 0.6 + (ry / dtS) * 0.4
      }
      d.lastX = e.clientX
      d.lastY = e.clientY
      d.lastT = now
    }

    const onDown = (e: PointerEvent) => {
      if (!(e.target instanceof HTMLCanvasElement)) return
      if (runtime.dialHand.active) return // the dial took this press
      if (runtime.dragMode === 'none') return // the film has the camera
      const now = performance.now()
      if (runtime.dragMode === 'crank') {
        const ch = runtime.crankHand
        ch.active = true
        ch.velocity = 0
        ch.lastX = e.clientX
        ch.lastT = now
        html.classList.add('is-cranking')
        return
      }
      const d = runtime.drag
      d.active = true
      d.vx = d.vy = 0
      d.moved = 0
      d.lastX = e.clientX
      d.lastY = e.clientY
      d.lastT = now
      html.classList.add('is-dragging')
    }

    const onUp = () => {
      if (runtime.dialHand.active) {
        runtime.dialHand.active = false
        html.classList.remove('is-turning-dial')
      }
      const ch = runtime.crankHand
      if (ch.active) {
        ch.active = false
        ch.velocity = Math.max(-TAU * 3, Math.min(TAU * 3, ch.velocity))
        html.classList.remove('is-cranking')
      }
      const d = runtime.drag
      if (!d.active) return
      d.active = false
      d.releasedAt = performance.now()
      d.vx = Math.max(-6, Math.min(6, d.vx))
      d.vy = Math.max(-3, Math.min(3, d.vy))
      html.classList.remove('is-dragging')
    }

    const onLeave = () => (runtime.pointer.active = false)

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const s = store.get()
      if (s.mode === 'inspect') store.set(s.part ? { part: null } : { mode: 'film', part: null, hover: null })
      else if (s.mode === 'hero') store.set({ mode: 'film' })
      else if (s.mode === 'journey') leaveJourney(journey.phase === 'hero' ? 'continue' : 'skip')
    }

    window.addEventListener('pointermove', onMove, { passive: true })
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    html.addEventListener('mouseleave', onLeave)
    return () => {
      mq.removeEventListener('change', onMq)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      html.removeEventListener('mouseleave', onLeave)
    }
  }, [])
}

/**
 * Magnetic pull for primary buttons: within a radius the button leans toward the
 * cursor (a third of the distance), released on a spring. Fine pointers only.
 */
export function useMagnetic(ref: React.RefObject<HTMLElement | null>, strength = 0.32, radius = 90) {
  useEffect(() => {
    const el = ref.current
    if (!el || !window.matchMedia('(pointer: fine)').matches || runtime.reducedMotion) return
    let tx = 0
    let ty = 0
    let x = 0
    let y = 0
    let vx = 0
    let vy = 0
    let raf = 0
    let running = false
    const loop = () => {
      // Lightly underdamped: a hint of give, settles in ~400 ms.
      const k = 0.16
      const c = 0.72
      vx = (vx + (tx - x) * k) * c
      vy = (vy + (ty - y) * k) * c
      x += vx
      y += vy
      el.style.translate = `${x.toFixed(2)}px ${y.toFixed(2)}px`
      if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > 0.05) raf = requestAnimationFrame(loop)
      else running = false
    }
    const kick = () => {
      if (!running) {
        running = true
        raf = requestAnimationFrame(loop)
      }
    }
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      const cx = r.left + r.width / 2 - x
      const cy = r.top + r.height / 2 - y
      const dx = e.clientX - cx
      const dy = e.clientY - cy
      // Distance to the button's edge, not its centre: big buttons stay magnetic at their ends.
      const ex = Math.max(0, Math.abs(dx) - r.width / 2)
      const ey = Math.max(0, Math.abs(dy) - r.height / 2)
      const inside = Math.hypot(ex, ey) < radius
      const nx = inside ? dx * strength * Math.min(1, 120 / (r.width / 2 + 60)) : 0
      const ny = inside ? dy * strength : 0
      if (nx !== tx || ny !== ty) {
        tx = nx
        ty = ny
        kick()
      }
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => {
      window.removeEventListener('pointermove', onMove)
      cancelAnimationFrame(raf)
      el.style.translate = ''
    }
  }, [ref, strength, radius])
}

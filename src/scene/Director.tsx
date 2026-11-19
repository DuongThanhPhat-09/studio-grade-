import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { createShot, desktop, desktopShots, mobile, mobileShots, sampleShots, turnsForScroll, type Shot } from '../animation/choreography'
import { clamp, damp, ease, invLerp, smoothstep, Spring } from '../animation/motion'
import { runtime, writeBar, writeText } from '../state/runtime'
import { store } from '../state/store'
import { stage } from './stage'
import { anchors, anchorWorld } from './anchors'
import { sim, updateGrind } from './grindSim'
import { beatIndex, beats, fmtTime, grindMath, methodById, recipe, type PartId } from '../content/copy'
import { isPortrait } from '../config/quality'
import { endJourney, seek, startJourney, stepJourney } from '../journey/direct'
import { jf, journey } from '../journey/state'
import { CUES } from '../journey/timeline'
import { lensPosition, type Lens } from '../journey/camera'

const DEG = Math.PI / 180
const PARTS: PartId[] = ['crank', 'knob', 'shaft', 'bearing', 'body', 'dial', 'burr', 'cup']

/** Inspect framing per part: distance, elevation, azimuth offset from the exploded view. */
const FOCUS: Record<PartId, { dist: number; el: number; az: number }> = {
  knob: { dist: 27, el: 8, az: -8 },
  crank: { dist: 44, el: 24, az: -18 },
  dial: { dist: 25, el: 26, az: 0 },
  body: { dist: 56, el: 6, az: 6 },
  shaft: { dist: 64, el: 6, az: -4 },
  bearing: { dist: 22, el: 18, az: 10 },
  burr: { dist: 25, el: 10, az: 6 },
  cup: { dist: 36, el: 12, az: 0 },
}

/** "Your Orme": a low, long-lens turntable portrait. */
const HERO_D: Partial<Shot> = { target: [1.4, 9.6, 0], az: 26, el: 2.5, dist: 76, fov: 17, shiftX: -0.2, shiftY: 0.02, envRot: 18, env: 1, key: 1.15, halo: 1.3, explode: 0, xray: 0 }
const HERO_M: Partial<Shot> = { ...HERO_D, dist: 128, fov: 22, shiftX: 0, shiftY: 0.44 }

/**
 * The Director turns scroll, time and input into a camera and a studio state.
 *
 *  scroll ──► choreography (eased keyframes, holds) ─┐
 *  mode / selection ──► shot overrides ───────────────┼─► springs (mass, settling) ──► camera
 *  pointer ──► small damped parallax                  │
 *  drag ──► yaw / orbit / crank, each with inertia ───┘
 *  load ──► intro light-up and a slow push-in
 */
export function Director() {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)

  const rig = useMemo(
    () => ({
      shot: createShot(),
      az: new Spring(0, 2.2),
      el: new Spring(0, 2.2),
      dist: new Spring(60, 2.0),
      fov: new Spring(20, 2.2),
      sx: new Spring(0, 2.2),
      sy: new Spring(0, 2.2),
      tx: new Spring(0, 2.2),
      ty: new Spring(10, 2.2),
      tz: new Spring(0, 2.2),
      rotY: new Spring(0, 2.6),
      crank: new Spring(0, 2.4),
      turns: new Spring(0, 7),
      explode: new Spring(0, 3.2),
      dial: new Spring(30, 7),
      heap: 0,
      sweep: -2,
      turntable: 0,
      prevCrank: 0,
      crankVel: 0,
      px: 0,
      py: 0,
      envRot: 0,
      lastBeat: 0,
      journey: false,
      last: new THREE.Vector3(),
      lastLens: null as null | Omit<Lens, 'target'>,
      crankCarry: null as null | number,
      crankOffset: 0,
      first: true,
      target: new THREE.Vector3(),
      tmp: new THREE.Vector3(),
    }),
    [],
  )

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)
    const now = performance.now()
    const s = store.get()
    const portrait = isPortrait(size.width, size.height)
    const reduced = runtime.reducedMotion
    const beatNow = clamp(Math.round(runtime.scroll), 0, beats.length - 1)
    const beatId = beats[beatNow].id
    const film = s.mode === 'film'
    const active = runtime.activeSection

    // ── Inside the Grind: the film takes the camera and the studio ───
    if (s.mode === 'journey') {
      if (!rig.journey || journey.restart) {
        // Entering from the site, or watching again from the film's last frame.
        const again = rig.journey && rig.lastLens !== null
        journey.restart = false
        rig.journey = true
        const from = again
          ? { ...rig.lastLens!, target: rig.last.clone() }
          : { target: rig.target.clone(), az: rig.az.value, el: rig.el.value, dist: rig.dist.value, fov: rig.fov.value, sx: rig.sx.value, sy: rig.sy.value }
        // d.x / turntable are folded into the film's own yaw (which it brings to 0).
        startJourney(
          {
            ...from,
            env: stage.env,
            key: stage.key,
            halo: stage.halo,
            envRot: stage.envRot,
            sweep: again ? stage.sweep : rig.sweep,
            crank: stage.crank,
            rotY: stage.rotY,
            heap: again ? stage.heap : rig.heap,
          },
          portrait,
          reduced,
          stage.gap,
        )
        runtime.drag.x = runtime.drag.vx = 0
        rig.turntable = 0
      }
      const L = stepJourney(dt, portrait, now)
      applyLens(camera, L, Math.max(0.003, Math.min(4, L.dist * 0.02)))
      // Macro: the far grinder falls into darkness, like light falloff in a macro set.
      const fog = scene.fog as THREE.Fog | null
      if (fog) {
        fog.near = THREE.MathUtils.lerp(220, L.dist * 2.4, jf.macro)
        fog.far = THREE.MathUtils.lerp(620, L.dist * 11, jf.macro)
      }
      runtime.dragMode = 'none'
      rig.last.copy(L.target)
      rig.lastLens = { az: L.az, el: L.el, dist: L.dist, fov: L.fov, sx: L.sx, sy: L.sy }
      if (runtime.dom.progress) runtime.dom.progress.style.transform = `scaleX(${invLerp(0, beats.length - 1, runtime.scroll)})`
      writeBar('j-progress', journey.t / CUES.hero_return)
      if (import.meta.env.DEV) Object.assign(window, { __stage: stage, __cam: camera, __journey: journey, __jf: jf, __jseek: seek })
      return
    }
    if (rig.journey) {
      // Back to the site: the springs continue from the film's last frame — no jump.
      rig.journey = false
      endJourney()
      const fog = scene.fog as THREE.Fog | null
      if (fog) {
        fog.near = 220
        fog.far = 620
      }
      camera.near = 4
      const ll = rig.lastLens
      if (ll && !runtime.snapCamera) {
        // The film may have orbited several times: hand back the nearest equivalent angle.
        rig.az.snap(rig.az.value + (((((ll.az - rig.az.value) % 360) + 540) % 360) - 180))
        rig.el.snap(ll.el)
        rig.dist.snap(ll.dist)
        rig.fov.snap(ll.fov)
        rig.sx.snap(ll.sx)
        rig.sy.snap(ll.sy)
        rig.tx.snap(rig.last.x)
        rig.ty.snap(rig.last.y)
        rig.tz.snap(rig.last.z)
      } else rig.first = true
      runtime.snapCamera = false
      rig.rotY.snap(stage.rotY)
      rig.sweep = stage.sweep
      rig.crankCarry = stage.crank
      rig.heap = stage.heap
    }

    updateGrind(now, dt, film && active === beatIndex.grind)

    // ── Shot: scroll choreography, then mode overrides ───────────────
    const shot = sampleShots(portrait ? mobileShots : desktopShots, runtime.scroll, rig.shot)
    const set = (o: Partial<Shot>) => Object.assign(shot, o)

    if (s.mode === 'inspect') {
      const eng = portrait ? mobile.engineering : desktop.engineering
      set({ ...eng, target: [...eng.target], explode: 1, xray: 0, shiftX: portrait ? 0 : 0.16 })
      if (portrait) set({ shiftY: 0.36, dist: eng.dist * 1.02 })
      const p = s.part
      const P = p ? anchorWorld(p, rig.tmp) : null
      if (p && P) {
        const f = FOCUS[p]
        set({
          target: [P.x, P.y, P.z],
          dist: f.dist * (portrait ? 2.05 : 1),
          el: f.el,
          az: eng.az + f.az,
          fov: portrait ? 22 : 18,
          shiftX: portrait ? 0 : 0.2,
          shiftY: portrait ? 0.4 : 0,
          key: 0.75,
          env: 0.9,
        })
      }
    } else if (s.mode === 'hero') {
      set({ ...(portrait ? HERO_M : HERO_D), target: [...(portrait ? HERO_M : HERO_D).target!] as [number, number, number] })
    } else if (beatId === 'build' && active === beatIndex.build && s.configFocus) {
      // The camera leans toward whatever is being chosen.
      const k = portrait ? 1.55 : 1
      if (s.configFocus === 'body') set({ target: [0.6, 9.0, 0], dist: 58 * k })
      if (s.configFocus === 'burr') set({ target: [0, 7.0, 0], dist: 38 * k, fov: 16, xray: 1, sweep: 8.8, az: shot.az + 6 })
      if (s.configFocus === 'knob') {
        const P = anchorWorld('knob', rig.tmp)
        if (P) set({ target: [P.x, P.y - 0.3, P.z], dist: 34 * k, fov: 16, el: 10 })
      }
    }

    // Short phones (≈ 375 × 667): the copy zone is relatively taller, so the product
    // sits smaller and higher. Macros are full-bleed and keep their framing.
    if (portrait && size.height < 740 && !/^m[A-Z]/.test(beatId)) {
      shot.dist *= 1.14
      shot.shiftY += 0.05
    }

    // Narrower landscape viewports pull back so the composition still breathes.
    const aspect = size.width / size.height
    const fit = portrait ? 1 : clamp(Math.pow(1.7 / aspect, 0.6), 1, 1.3)

    // ── Intro: darkness → rim → glints → silhouette → full light ─────
    const introT = runtime.ready ? (now - runtime.introStart) / 1000 : 0
    const k = reduced ? 0.35 : 1
    const rim = ease.inOutSine(clamp(introT / (2.0 * k)))
    const silhouette = ease.inOutSine(clamp((introT - 1.0 * k) / (1.8 * k)))
    const keyUp = ease.inOutSine(clamp((introT - 2.0 * k) / (1.6 * k)))
    const push = reduced ? 1 : ease.outExpo(clamp(introT / 4.0))
    stage.intro = keyUp

    // ── Finale: the light simplifies the longer you stay ────────────
    if (film && beatId === 'final' && active === beatIndex.final) runtime.finaleTime += dt
    else runtime.finaleTime = Math.max(0, runtime.finaleTime - dt * 3)
    const fin = ease.inOutSine(clamp(runtime.finaleTime / 10))

    // ── Pointer parallax: a few degrees, heavily damped ──────────────
    const parallax = !reduced && runtime.pointer.fine && runtime.pointer.active
    rig.px = damp(rig.px, parallax ? runtime.pointer.x : 0, 1.6, dt)
    rig.py = damp(rig.py, parallax ? runtime.pointer.y : 0, 1.6, dt)

    // ── Drag routing ─────────────────────────────────────────────────
    const crankMode = film && beatId === 'xray' && active === beatIndex.xray
    runtime.dragMode = s.mode === 'inspect' ? 'orbit' : crankMode ? 'crank' : 'yaw'
    const d = runtime.drag
    if (!d.active) {
      d.x += d.vx * dt
      d.vx *= Math.exp(-3.2 * dt)
      d.y += d.vy * dt
      d.vy *= Math.exp(-4 * dt)
      const idle = (now - d.releasedAt) / 1000
      const keep = !film || beatId === 'final' || beatId === 'build'
      if (!keep && idle > 0.9) d.x = damp(d.x, 0, 1.4, dt)
      if (s.mode !== 'inspect') d.y = damp(d.y, 0, 3, dt)
    }
    d.y = clamp(d.y, -0.35, 0.55)
    const ch = runtime.crankHand
    if (!ch.active) {
      const before = ch.angle
      ch.angle += ch.velocity * dt
      ch.velocity *= Math.exp(-0.85 * dt) // a little flywheel
      ch.total += Math.abs(ch.angle - before) / (Math.PI * 2)
    }

    // ── Springs ──────────────────────────────────────────────────────
    const w = reduced ? 6 : 1
    if (rig.first) {
      rig.az.snap(shot.az)
      rig.el.snap(shot.el)
      rig.dist.snap(shot.dist * fit * 1.12)
      rig.fov.snap(shot.fov)
      rig.sx.snap(shot.shiftX)
      rig.sy.snap(shot.shiftY)
      rig.tx.snap(shot.target[0])
      rig.ty.snap(shot.target[1])
      rig.tz.snap(shot.target[2])
      rig.rotY.snap(shot.rotY * DEG)
      rig.crank.snap(shot.crank * DEG)
      rig.envRot = shot.envRot * DEG + 1.3
      rig.first = false
    }
    // Reduced motion: no travelling shots. The lens cuts under a short fade instead.
    if (reduced && beatNow !== rig.lastBeat) cut()
    rig.lastBeat = beatNow

    const az = rig.az.step(shot.az + rig.px * 2.2, dt, 2.2 * w)
    const el = rig.el.step(shot.el + rig.py * 1.2 + d.y / DEG, dt, 2.2 * w)
    const dist = rig.dist.step(shot.dist * fit * (1 + (1 - push) * 0.12), dt, 2.0 * w)
    const fov = rig.fov.step(shot.fov, dt, 2.2 * w)
    const sx = rig.sx.step(shot.shiftX, dt, 2.2 * w)
    const sy = rig.sy.step(shot.shiftY, dt, 2.2 * w)
    rig.target.set(
      rig.tx.step(shot.target[0], dt, 2.2 * w),
      rig.ty.step(shot.target[1], dt, 2.2 * w),
      rig.tz.step(shot.target[2], dt, 2.2 * w),
    )

    // ── Camera: orbit, look, focal length, lens shift ────────────────
    const ca = Math.cos(el * DEG)
    camera.position.set(
      rig.target.x + dist * Math.sin(az * DEG) * ca,
      rig.target.y + dist * Math.sin(el * DEG),
      rig.target.z + dist * Math.cos(az * DEG) * ca,
    )
    camera.lookAt(rig.target)
    camera.fov = fov
    camera.updateProjectionMatrix()
    camera.projectionMatrix.elements[8] = -sx
    camera.projectionMatrix.elements[9] = -sy
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()

    // ── Product ──────────────────────────────────────────────────────
    const turntableOn = !reduced && ((film && beatId === 'final') || s.mode === 'hero')
    if (turntableOn) rig.turntable += dt * (s.mode === 'hero' ? 0.16 : 0.1)
    else {
      rig.turntable = Math.atan2(Math.sin(rig.turntable), Math.cos(rig.turntable))
      rig.turntable = damp(rig.turntable, 0, 1.2, dt)
    }
    stage.rotY = rig.rotY.step(shot.rotY * DEG, dt, 2.6 * w) + d.x + rig.turntable

    const scrollTurns = turnsForScroll(runtime.scroll, beatIndex.xray)
    const turns = rig.turns.step(scrollTurns, dt, 7)
    runtime.turns = Math.max(0, turns) + ch.total
    // Clockwise seen from above, as you'd actually turn it.
    let crank = rig.crank.step(shot.crank * DEG, dt, 2.4 * w) - turns * Math.PI * 2 + ch.angle + sim.crank
    if (rig.crankCarry !== null) {
      // Returning from the film: the crank continues from where the film left it.
      rig.crankOffset = rig.crankCarry - crank
      rig.crankCarry = null
    }
    crank += rig.crankOffset
    rig.crankVel = damp(rig.crankVel, (crank - rig.prevCrank) / Math.max(dt, 1e-3), 8, dt)
    rig.prevCrank = crank
    stage.crank = crank
    stage.crankVel = rig.crankVel
    stage.explode = rig.explode.step(shot.explode, dt, 3.2 * w)

    // Dial: settles through its detents rather than gliding.
    const labClicks = recipe(methodById[s.labMethod], s.labDose).clicks
    const clicksTarget = beatId === 'lab' ? labClicks : s.clicks
    const dv = rig.dial.step(clicksTarget, dt, 8)
    const detented = Math.floor(dv) + smoothstep(0.3, 0.7, dv - Math.floor(dv))
    stage.dial = (-detented / grindMath.clicksPerTurn) * Math.PI * 2
    stage.gap = detented * 0.012 // the burr drop, exaggerated ×6 so it reads

    // ── X-ray: a section plane that travels, not a crossfade ─────────
    const sweepTarget = shot.xray > 0.5 ? shot.sweep : -2
    const gapToGo = sweepTarget - rig.sweep
    const speed = reduced ? 80 : Math.min(17, Math.abs(gapToGo) * 2.4 + 3)
    rig.sweep += Math.sign(gapToGo) * Math.min(Math.abs(gapToGo), speed * dt)
    const moving = Math.abs(gapToGo) > 0.05
    const onBody = rig.sweep > -1 && rig.sweep < 21
    stage.sweep = rig.sweep
    stage.edge = damp(stage.edge, onBody ? (moving ? 1 : sweepTarget < 25 ? 0.45 : 0) : 0, 6, dt)

    // ── Grounds ──────────────────────────────────────────────────────
    const inGrind = film && active === beatIndex.grind
    const inDrive = crankMode
    const driveFlow = clamp(Math.abs(rig.crankVel) / (Math.PI * 2 * 0.8)) * smoothstep(12, 20, rig.sweep)
    stage.flow = inGrind ? sim.flow : inDrive ? driveFlow : 0
    const heapTarget = inGrind ? sim.grams : inDrive ? Math.min(18, runtime.turns * grindMath.gramsPerTurn) : 0
    rig.heap = damp(rig.heap, heapTarget, inGrind ? 12 : 3, dt)
    stage.heap = rig.heap

    // ── Presence: dim the rest, lift what matters ────────────────────
    const focus = s.mode === 'inspect' ? s.part : null
    const hover = s.mode === 'inspect' || (film && beatId === 'engineering') ? s.hover : null
    for (const p of PARTS) {
      let v = 1
      if (focus) v = p === focus ? 1.3 : p === hover ? 0.55 : 0.26
      else if (hover) v = p === hover ? 1.3 : 0.62
      else if (inDrive || inGrind) v = p === 'crank' || p === 'shaft' || p === 'burr' ? 1.15 : p === 'dial' ? (inGrind ? 1.15 : 0.8) : 1
      stage.presence[p] = v
    }
    const A = focus ? anchorWorld(focus, rig.tmp) : null
    stage.accent.power = damp(stage.accent.power, A ? 1 : 0, 4, dt)
    if (A) {
      stage.accent.x = A.x
      stage.accent.y = A.y
      stage.accent.z = A.z
    }

    // ── Studio ───────────────────────────────────────────────────────
    const envTarget = shot.envRot * DEG + (1 - rim) * 1.3 + fin * 0.6
    rig.envRot = damp(rig.envRot, envTarget, 2.4, dt)
    stage.envRot = rig.envRot
    stage.env = shot.env * (0.03 + 0.97 * rim) * (1 - 0.45 * fin)
    stage.key = shot.key * keyUp * (1 - 0.6 * fin)
    stage.halo = shot.halo * silhouette * (1 - 0.3 * fin)

    // ── DOM readouts, written straight from the loop (no React) ─────
    const t = runtime.turns
    writeText('x-turns', t.toFixed(1))
    writeText('x-grams', Math.min(18, t * grindMath.gramsPerTurn).toFixed(1))
    writeText('x-rpm', String(Math.round((Math.abs(rig.crankVel) / (Math.PI * 2)) * 60)))
    const shownClicks = Math.round(detented)
    writeText('g-clicks', String(shownClicks))
    writeText('g-size', String(grindMath.particle(shownClicks)))
    const gapMm = ((shownClicks * grindMath.micronsPerClick) / 1000).toFixed(2)
    writeText('g-gap', gapMm)
    writeText('c-gap', `${gapMm} mm · ${grindMath.particle(shownClicks)} µm grounds`)
    writeText('g-turns', sim.turns.toFixed(0))
    writeText('g-grams', sim.grams.toFixed(1))
    writeText('g-time', fmtTime(Math.round(sim.seconds)))
    writeText('g-lapse', `×${sim.lapse.toFixed(1)}`)
    writeBar('g-progress', sim.progress)
    writeBar('x-progress', Math.min(1, t / 40))
    if (runtime.dom.progress) runtime.dom.progress.style.transform = `scaleX(${invLerp(0, beats.length - 1, runtime.scroll)})`

    if (import.meta.env.DEV) Object.assign(window, { __rig: rig, __stage: stage, __cam: camera, __shot: shot, __gl: gl, __scene: scene, __store: store, __sim: sim, __anchors: anchors })
  }, -1)

  return null
}

/** Reduced-motion cut: a brief fade to the studio's black while the lens jumps. */
function cut() {
  const el = document.querySelector<HTMLElement>('.cut')
  if (!el) return
  el.classList.remove('is-cutting')
  void el.offsetWidth
  el.classList.add('is-cutting')
}

const _pos = new THREE.Vector3()
/** Apply a film lens: orbit position, look-at, focal length, lens shift, near plane. */
function applyLens(camera: THREE.PerspectiveCamera, L: Lens, near: number) {
  camera.position.copy(lensPosition(L, _pos))
  camera.lookAt(L.target)
  camera.fov = L.fov
  camera.near = near
  camera.updateProjectionMatrix()
  camera.projectionMatrix.elements[8] = -L.sx
  camera.projectionMatrix.elements[9] = -L.sy
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert()
}

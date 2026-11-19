import { useMemo, useRef } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import * as THREE from 'three'
import { getParts, DIM, EXPLODE, CRANK, KNURL_PITCH } from './parts'
import { Grounds } from './Grounds'
import { BODY_FINISH, BURR_FINISH, KNOB_FINISH, LiveMaterial, getLibrary, makeGhost, withRepeat, ghostUniforms, shellAlpha } from '../materials/materials'
import { bodyMark, dialMarks, KNURL_CELLS_PER_TILE } from '../materials/textures'
import { stage } from '../scene/stage'
import { anchors } from '../scene/anchors'
import { clamp, ease, Spring } from '../animation/motion'
import { runtime } from '../state/runtime'
import { store } from '../state/store'
import { beatIndex, type PartId } from '../content/copy'
import { jf } from '../journey/state'
import { MacroCone, MacroRing } from '../journey/MacroBurr'
import { JourneyScene } from '../journey/JourneyScene'

type Group = Exclude<keyof typeof EXPLODE, 'lift'>

/** Heavier parts settle more slowly. */
const MASS: Record<Group, number> = {
  crank: 4.6,
  cap: 4.4,
  dial: 4.0,
  body: 3.1,
  bearing: 4.2,
  burr: 3.6,
  outerBurr: 3.8,
  cup: 3.3,
}

const PARTS: PartId[] = ['crank', 'knob', 'shaft', 'bearing', 'body', 'dial', 'burr', 'cup']

/**
 * The assembled grinder. Each selectable part owns its material instances
 * (LiveMaterial) so it can be dimmed, emphasised, ghosted or refinished on its own.
 */
export function Grinder({ detail = 1 }: { detail?: number }) {
  const parts = useMemo(() => getParts(detail), [detail])
  const lib = useMemo(() => getLibrary(), [])

  const kit = useMemo(() => {
    const tile = KNURL_PITCH * KNURL_CELLS_PER_TILE
    const body = lib.aluminium(parts.body.circumference / 1.2, parts.body.arc / 1.2)
    body.map = bodyMark(parts.body.vAt, parts.body.circumference)
    const cup = lib.aluminium((Math.PI * 2 * DIM.r) / 1.2, parts.cup.arc / 1.2)
    const grip = lib.anodised()
    const knurl = lib.anodised()
    knurl.normalMap = withRepeat(lib.knurlTex.normal, Math.round(parts.knurl.circumference / tile), parts.knurl.arc / tile)
    knurl.normalScale = new THREE.Vector2(0.85, 0.85)
    knurl.roughnessMap = withRepeat(lib.knurlTex.roughness, Math.round(parts.knurl.circumference / tile), parts.knurl.arc / tile)
    knurl.roughness = 0.62
    for (const m of [body, grip, knurl]) makeGhost(m, 'body')
    makeGhost(cup, 'cup')

    const dial = lib.anodised()
    dial.color = new THREE.Color('#ffffff')
    dial.map = dialMarks(parts.dial.vFrom, parts.dial.vTo)

    const mats = {
      body,
      cup,
      grip,
      knurl,
      dial,
      race: lib.steelBearing(),
      seal: lib.rubber(),
      cap: lib.steelTurned(),
      shaft: lib.steelPolished(),
      spacer: lib.steelPolished(),
      arm: lib.steelBrushed(),
      nut: lib.steelTurned(),
      washer: lib.steelTurned(),
      knob: lib.knob(),
      burrIn: lib.burr(),
      burrOut: lib.burr(),
    }
    const live = Object.fromEntries(Object.entries(mats).map(([k, m]) => [k, new LiveMaterial(m)])) as Record<
      keyof typeof mats,
      LiveMaterial
    >
    const byPart: Record<PartId, LiveMaterial[]> = {
      body: [live.body, live.grip, live.knurl],
      cup: [live.cup],
      dial: [live.dial],
      bearing: [live.race, live.seal, live.cap],
      shaft: [live.shaft, live.spacer],
      crank: [live.arm, live.nut, live.washer],
      knob: [live.knob],
      burr: [live.burrIn, live.burrOut],
    }
    return { mats, live, byPart, shell: [body, cup, grip, knurl] }
  }, [lib, parts])

  const root = useRef<THREE.Group>(null!)
  const g = {
    cup: useRef<THREE.Group>(null!),
    outerBurr: useRef<THREE.Group>(null!),
    burr: useRef<THREE.Group>(null!),
    bearing: useRef<THREE.Group>(null!),
    body: useRef<THREE.Group>(null!),
    dial: useRef<THREE.Group>(null!),
    cap: useRef<THREE.Group>(null!),
    crank: useRef<THREE.Group>(null!),
  }
  const crankSpin = useRef<THREE.Group>(null!)
  const burrSpin = useRef<THREE.Group>(null!)
  const burrGap = useRef<THREE.Group>(null!)
  const knobSpin = useRef<THREE.Group>(null!)
  const dialSpin = useRef<THREE.Group>(null!)
  const internals = useRef<THREE.Group>(null!)
  const upperBearing = useRef<THREE.Group>(null!)
  const shellMeshes = useRef<THREE.Mesh[]>([])
  const burrMeshes = useRef<THREE.Mesh[]>([])

  const springs = useMemo(() => {
    const s = {} as Record<Group, Spring>
    ;(Object.keys(MASS) as Group[]).forEach((k) => (s[k] = new Spring(0, MASS[k])))
    return s
  }, [])
  const lift = useMemo(() => new Spring(0, 2.6), [])
  const lastConfig = useRef<unknown>(null)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 1 / 20)

    // ── Explode: staggered, each part on its own spring ──────────────
    const E = stage.explode
    let total = 0
    ;(Object.keys(MASS) as Group[]).forEach((k) => {
      const { y, delay } = EXPLODE[k]
      const v = springs[k].step(ease.part(clamp((E - delay) / (1 - 0.3))), dt)
      total += v
      const o = g[k].current
      o.userData.baseY ??= o.position.y
      o.position.y = o.userData.baseY + v * y
    })
    root.current.position.y = lift.step(ease.inOutSine(clamp(E * 1.4)), dt) * EXPLODE.lift
    root.current.rotation.y = stage.rotY
    runtime.explode = total / Object.keys(MASS).length

    // ── Drivetrain: crank → hex shaft → burr, 1:1. The knob stays in the hand. ──
    crankSpin.current.rotation.y = stage.crank
    burrSpin.current.rotation.y = stage.crank
    knobSpin.current.rotation.y = -stage.crank
    dialSpin.current.rotation.y = stage.dial
    burrGap.current.position.y = -stage.gap

    // ── X-ray ────────────────────────────────────────────────────────
    ghostUniforms.uSweep.value = stage.sweep
    ghostUniforms.uEdge.value = stage.edge
    const ghosting = stage.sweep > 0.5
    internals.current.visible = springs.body.value > 0.004 || ghosting
    upperBearing.current.visible = ghosting
    for (const m of shellMeshes.current) m.castShadow = !ghosting

    // ── Inside the Grind: the shell can vanish (body) or stay as glass the lens passes
    //    through (cup); the burr meshes hand over to the GPU-evaluated macro surfaces. ──
    const j = jf.active
    shellAlpha.body.value = j ? jf.shellAlpha : 1
    shellAlpha.cup.value = j ? jf.cupAlpha : 1
    ghostUniforms.uNear.value.set(j ? jf.near[0] : 0, j ? jf.near[1] : 0)
    const macroGlass = j && jf.macro > 0.05
    for (const m of shellMeshes.current) {
      const isCup = m.userData.part === 'cup'
      m.visible = isCup || shellAlpha.body.value > 0.004
      // Glass the lens is inside must not write depth: focus and AO read what is behind it.
      ;(m.material as THREE.Material).depthWrite = !macroGlass
    }
    burrMeshes.current.forEach((m) => (m.visible = !jf.fine))

    // ── Finishes (configurator) ──────────────────────────────────────
    const config = store.get().config
    if (config !== lastConfig.current) {
      lastConfig.current = config
      const b = BODY_FINISH[config.body]
      kit.live.body.setFinish(b)
      kit.live.cup.setFinish(b)
      kit.live.burrIn.setFinish(BURR_FINISH[config.burr])
      kit.live.burrOut.setFinish({ ...BURR_FINISH[config.burr], roughness: BURR_FINISH[config.burr].roughness + 0.06 })
      kit.live.knob.setFinish(KNOB_FINISH[config.knob])
    }
    for (const p of PARTS) {
      for (const lm of kit.byPart[p]) {
        lm.presenceTarget = stage.presence[p]
        lm.update(dt, 4)
      }
    }
  })

  // ── Pointer: hover and select parts, grab the dial ───────────────
  const partOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => (e.object.userData.part as PartId | undefined) ?? null
  const interactive = () => {
    const s = store.get()
    return s.mode === 'inspect' || (s.mode === 'film' && runtime.activeSection === beatIndex.engineering)
  }
  const onMove = (e: ThreeEvent<PointerEvent>) => {
    // R3F bubbles through every intersected mesh; only the nearest one speaks.
    e.stopPropagation()
    const html = document.documentElement
    html.classList.add('is-over')
    const p = partOf(e)
    const dialGrab = p === 'dial' && store.get().mode === 'film' && runtime.activeSection === beatIndex.grind
    html.classList.toggle('is-over-dial', dialGrab)
    if (!interactive()) return
    html.classList.toggle('is-over-part', !!p)
    if (store.get().hover !== p) store.set({ hover: p })
  }
  const onOut = () => {
    const html = document.documentElement
    html.classList.remove('is-over', 'is-over-part', 'is-over-dial')
    if (store.get().hover) store.set({ hover: null })
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || runtime.drag.moved > 6) return // that was a drag, not a click
    const p = partOf(e)
    if (!p || !interactive()) return
    e.stopPropagation()
    store.set({ mode: 'inspect', part: p })
  }
  const onDown = (e: ThreeEvent<PointerEvent>) => {
    // The dial is a real control in the grind chapter: drag it through its detents.
    if (partOf(e) === 'dial' && store.get().mode === 'film' && runtime.activeSection === beatIndex.grind) {
      e.stopPropagation()
      runtime.dialHand.active = true
      runtime.dialHand.startX = e.nativeEvent.clientX
      runtime.dialHand.startClicks = store.get().clicks
      document.documentElement.classList.add('is-turning-dial')
    }
  }

  const sh = { castShadow: true, receiveShadow: true }
  const shell = (m: THREE.Mesh | null) => {
    if (m && !shellMeshes.current.includes(m)) shellMeshes.current.push(m)
  }
  const burr = (m: THREE.Mesh | null) => {
    if (m && !burrMeshes.current.includes(m)) burrMeshes.current.push(m)
  }
  const anchor = (part: PartId | 'hub', radius: number) => (o: THREE.Object3D | null) => {
    if (o) anchors.set(part, { object: o, radius })
  }
  const M = kit.mats
  const part = (id: PartId) => ({ userData: { part: id } })

  return (
    <group ref={root} name="grinder" onPointerMove={onMove} onPointerOut={onOut} onClick={onClick} onPointerDown={onDown}>
      {/* Catch cup */}
      <group ref={g.cup}>
        <mesh ref={shell} geometry={parts.cup.geometry} material={M.cup} {...sh} {...part('cup')} />
        <mesh ref={shell} geometry={parts.thread} material={M.cup} castShadow {...part('cup')} />
        <object3D ref={anchor('cup', 2.4)} position-y={2.6} />
      </group>

      <group ref={internals}>
        <group ref={g.outerBurr} position-y={DIM.outerBurrY}>
          <mesh ref={burr} geometry={parts.outerBurr} material={M.burrOut} {...sh} {...part('burr')} />
          <MacroRing source={M.burrOut} />
        </group>
        <group ref={g.burr}>
          <group ref={burrGap}>
            <group ref={burrSpin}>
              <mesh ref={burr} geometry={parts.innerBurr} material={M.burrIn} position-y={DIM.innerBurrY} {...sh} {...part('burr')} />
              <mesh geometry={parts.shaft} material={M.shaft} {...sh} {...part('shaft')} />
            </group>
            <MacroCone source={M.burrIn} />
            <object3D ref={anchor('burr', 1.95)} position-y={DIM.innerBurrY + 0.75} />
            <object3D ref={anchor('shaft', 0.35)} position-y={11.6} />
          </group>
        </group>
        <group ref={g.bearing} position-y={DIM.bearingY}>
          <mesh geometry={parts.bearing.outer.geometry} material={M.race} {...sh} {...part('bearing')} />
          <mesh geometry={parts.bearing.inner.geometry} material={M.race} {...sh} {...part('bearing')} />
          <mesh geometry={parts.bearing.seal.geometry} material={M.seal} receiveShadow {...part('bearing')} />
          <object3D ref={anchor('bearing', 1.0)} />
        </group>
      </group>

      {/* Body + grip sleeve; the upper bearing lives inside and shows only in X-ray */}
      <group ref={g.body}>
        <mesh ref={shell} geometry={parts.body.geometry} material={M.body} {...sh} {...part('body')} />
        <mesh ref={shell} geometry={parts.grip.bottom.geometry} material={M.grip} {...sh} {...part('body')} />
        <mesh ref={shell} geometry={parts.knurl.geometry} material={M.knurl} {...sh} {...part('body')} />
        <mesh ref={shell} geometry={parts.grip.top.geometry} material={M.grip} {...sh} {...part('body')} />
        <group ref={upperBearing} position-y={DIM.upperBearingY}>
          <mesh geometry={parts.bearing.outer.geometry} material={M.race} {...part('bearing')} />
          <mesh geometry={parts.bearing.inner.geometry} material={M.race} {...part('bearing')} />
          <mesh geometry={parts.bearing.seal.geometry} material={M.seal} {...part('bearing')} />
        </group>
        <object3D ref={anchor('body', 2.47)} position-y={10} />
      </group>

      {/* Adjustment dial */}
      <group ref={g.dial}>
        <group ref={dialSpin}>
          <mesh geometry={parts.dial.geometry} material={M.dial} {...sh} {...part('dial')} />
        </group>
        <object3D ref={anchor('dial', 1.8)} position-y={(DIM.bodyTop + DIM.dialTop) / 2} />
      </group>

      {/* Bearing cap + spacer */}
      <group ref={g.cap}>
        <mesh geometry={parts.cap.geometry} material={M.cap} {...sh} {...part('bearing')} />
        <mesh geometry={parts.spacer.geometry} material={M.spacer} {...sh} {...part('shaft')} />
      </group>

      {/* Crank */}
      <group ref={g.crank} position-y={DIM.armY}>
        {/* Stable point on the hub: labels must not orbit with the arm. */}
        <object3D ref={anchor('hub', 0.6)} position-y={0.3} />
        <group ref={crankSpin}>
          <mesh geometry={parts.arm} material={M.arm} {...sh} {...part('crank')} />
          <mesh geometry={parts.capNut.geometry} material={M.nut} {...sh} {...part('crank')} />
          <object3D ref={anchor('crank', 0.7)} position={[CRANK.length * 0.42, 0.2, 0]} />
          <group position-x={CRANK.length}>
            <mesh geometry={parts.washer.geometry} material={M.washer} {...sh} {...part('crank')} />
            <group ref={knobSpin}>
              <mesh geometry={parts.knob.geometry} material={M.knob} {...sh} {...part('knob')} />
            </group>
            <object3D ref={anchor('knob', 0.78)} position-y={1.9} />
          </group>
        </group>
      </group>

      <Grounds />
      <JourneyScene />
    </group>
  )
}

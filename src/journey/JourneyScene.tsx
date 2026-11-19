import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '../config/quality'
import { clamp, smoothstep } from '../animation/motion'
import { journey, jf } from './state'
import { CUES, tau, theta } from './timeline'
import { beanGeometry, flakeGeometry, getFracture, rng, shardGeometry } from './fracture'
import { makeBeanMaterial, makeGroundsMaterial } from './materials'
import {
  angleOf,
  coneR,
  crackL0,
  crackL1,
  exitFrame,
  fragment1,
  fragment2,
  heapY,
  heroBean,
  plan,
  polar,
  pose,
  ringR,
  RING_BOTTOM,
  RING_TOP,
  subject,
} from './paths'

/**
 * Everything that exists only inside the film: the hero bean and its fragments, the
 * beans around it, the chips and chaff of the fracture, the grounds (falling and
 * resting) and two macro practicals. All of it is driven by film time.
 */

const noRaycast = () => null
const G = 981

export function JourneyScene() {
  const q = useQuality()
  const camera = useThree((s) => s.camera)
  const f = useMemo(() => getFracture(), [])

  /* ── Hero bean & fragments ─────────────────────────────────────── */
  const bean = useMemo(() => makeBeanMaterial(f.seeds, f.contact), [f])
  const l1 = useMemo(() => f.l1.map((c) => makeBeanMaterial(c.seeds, f.contact.clone().sub(c.c))), [f])
  const l2 = useMemo(() => makeBeanMaterial(), [])
  const beanRef = useRef<THREE.Mesh>(null!)
  const l1Refs = useRef<THREE.Mesh[]>([])
  const l2Refs = useRef<THREE.Mesh[]>([])

  /* ── Context beans ─────────────────────────────────────────────── */
  const ctxGeo = useMemo(() => beanGeometry(48, 34, true), [])
  const ctxMat = useMemo(() => makeBeanMaterial().material, [])
  const ctx = useRef<THREE.InstancedMesh>(null!)
  const CONTEXT = useMemo(
    () => [
      // Ahead of the hero: already caught, carried off to the left of frame.
      { dt: -1.1, phi: -0.42, r: 1.84, spin: 1.2 },
      { dt: -0.4, phi: -1.05, r: 1.76, spin: -0.8 },
      // Across the throat and behind the cone: depth, mostly out of focus.
      { dt: 0.3, phi: 2.5, r: 1.8, spin: 0.6 },
      { dt: 0.9, phi: -2.2, r: 1.86, spin: 1.6 },
      { dt: 1.6, phi: 1.9, r: 1.78, spin: -1.1 },
      { dt: 2.2, phi: 3.0, r: 1.82, spin: 0.9 },
    ],
    [],
  )

  /* ── Debris: chips and silverskin chaff ────────────────────────── */
  const shard = useMemo(() => shardGeometry(5), [])
  const chipMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3b2416', roughness: 0.85, flatShading: true }), [])
  const flake = useMemo(() => flakeGeometry(), [])
  const chaffMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#8a6d50', roughness: 0.8, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }),
    [],
  )
  const chips = useRef<THREE.InstancedMesh>(null!)
  const chaff = useRef<THREE.InstancedMesh>(null!)

  /* ── Grounds: falling cloud + resting carpet, one instanced draw ─ */
  const grounds = useMemo(() => makeGroundsMaterial(), [])
  const groundsMesh = useRef<THREE.InstancedMesh>(null!)
  const MAX_GROUNDS = 2600

  /* ── Macro practicals ──────────────────────────────────────────── */
  const probe = useRef<THREE.PointLight>(null!)
  const rim = useRef<THREE.PointLight>(null!)

  // Per-run data (depends on the solved plan): debris spawn points, grounds layout.
  const run = useRef(-1)
  const debris = useRef<
    { t0: number; o: THREE.Vector3; v: THREE.Vector3; k: number; g: number; s: number; axis: THREE.Vector3; w: number; chaff: boolean }[]
  >([])

  const buildRun = () => {
    const r = rng(4242)
    const list: typeof debris.current = []
    const tmp = pose()
    const add = (t0: number, o: THREE.Vector3, n: number, opts: { speed: number; chaff?: boolean; spread?: number }) => {
      for (let i = 0; i < n; i++) {
        const dir = new THREE.Vector3(r() - 0.5, r() * 0.7 + 0.1, r() - 0.5).normalize()
        const isChaff = !!opts.chaff
        list.push({
          t0: t0 + r() * (opts.spread ?? 0.25),
          o: o.clone().add(new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).multiplyScalar(0.18)),
          v: dir.multiplyScalar(opts.speed * (0.4 + r() * 0.8)),
          k: isChaff ? 40 : 14,
          g: isChaff ? 70 : 520,
          s: isChaff ? 0.018 + r() * 0.024 : 0.006 + r() * 0.013,
          axis: new THREE.Vector3(r() - 0.5, r() - 0.5, r() - 0.5).normalize(),
          w: isChaff ? 40 + r() * 60 : 80 + r() * 140,
          chaff: isChaff,
        })
      }
    }
    const contact = heroBean(CUES.bean_contact + 0.05, tmp).p.clone()
    add(CUES.bean_contact + 0.02, contact, 12, { speed: 5 })
    add(CUES.bean_contact + 0.3, contact, 5, { speed: 2.5, chaff: true, spread: 0.8 })
    const center = heroBean(CUES.bean_fracture, tmp).p.clone()
    add(CUES.bean_fracture, center, 34, { speed: 7, spread: 0.15 })
    add(CUES.bean_fracture + 0.05, center, 8, { speed: 3, chaff: true, spread: 0.6 })
    for (let i = 0; i < f.l1.length; i++) add(CUES.fragments_split, fragment1(i, CUES.fragments_split, tmp).p.clone(), 7, { speed: 5, spread: 0.2 })
    // Shed along the followed particle's path as the teeth take it down to size.
    for (let k = 0; k < 9; k++) {
      const t0 = CUES.particle_follow + 0.4 + k * 0.6
      add(t0, subject(t0, tmp).p.clone(), 4, { speed: 2.2, spread: 0.3 })
    }
    debris.current = list

    // Grounds: a falling cloud that leaves the gap around the particle, and the carpet
    // it lands on. Both are laid out in world space, landing on the heap surface.
    const g = groundsMesh.current.geometry
    const A = g.getAttribute('aA') as THREE.InstancedBufferAttribute
    const B = g.getAttribute('aB') as THREE.InstancedBufferAttribute
    const C = g.getAttribute('aC') as THREE.InstancedBufferAttribute
    const ex = exitFrame()
    const gr = rng(99)
    const gauss = () => (gr() + gr() + gr() - 1.5) / 1.5
    const fall = q.journey.fall
    const carpet = q.journey.carpet
    const R = q.journey.patch
    const tauA = tau(CUES.grounds_release - 0.9)
    const tauB = tau(CUES.scale_reveal + 0.8)
    let n = 0
    for (let i = 0; i < fall; i++, n++) {
      // One particle first: the rest leave the gap from behind the cutaway's walls,
      // so they are hidden as they appear and pour in from both sides.
      const g0 = gauss()
      const da = Math.sign(g0 || 1) * (0.42 + Math.abs(g0) * 0.6)
      const y = RING_BOTTOM + 0.02 + gr() * 0.1
      const rr = (coneR(y) + ringR(y)) / 2 + (gr() - 0.5) * 0.05
      const p = polar(ex.phi + da, rr, y)
      // Release spread across the window, denser right around the particle's own exit.
      const u = gr()
      const tr = u < 0.4 ? ex.tau + gauss() * 0.03 : tauA + (tauB - tauA) * gr()
      const lr = 1.32 + gauss() * 0.32
      const la = plan.phiLand + da * 0.85 + gauss() * 0.08
      const size = 0.02 + gr() * 0.022
      const land = polar(la, lr, heapY(lr) + size * 0.5)
      A.setXYZW(n, p.x, p.y, p.z, tr)
      B.setXYZW(n, land.x, land.y, land.z, size)
      C.setXYZW(n, gr() - 0.5, gr() - 0.5, gr() - 0.5, gr())
    }
    for (let i = 0; i < carpet; i++, n++) {
      // Disc around the landing point, a little denser at the centre.
      const rad = R * Math.pow(gr(), 0.62)
      const a = gr() * Math.PI * 2
      const x = plan.land.x + Math.cos(a) * rad
      const z = plan.land.z + Math.sin(a) * rad
      const rr = Math.hypot(x, z)
      const edge = 1 - smoothstep(R * 0.65, R, rad)
      const size = (0.026 + gr() * 0.03) * (0.35 + 0.65 * edge)
      const y = heapY(rr) + size * (0.1 + gr() * 0.35)
      A.setXYZW(n, x, y, z, -1e6)
      B.setXYZW(n, x, y, z, size)
      // Settled grains lie down: turned about the vertical, only slightly tipped.
      C.setXYZW(n, (gr() - 0.5) * 0.5, 1, (gr() - 0.5) * 0.5, gr())
    }
    groundsMesh.current.count = n
    A.needsUpdate = B.needsUpdate = C.needsUpdate = true
  }

  // The grounds layout depends on tier counts: rebuild on tier change too.
  useEffect(() => {
    run.current = -1
  }, [q.journey.fall, q.journey.carpet, q.journey.patch])

  const groundsGeo = useMemo(() => {
    const base = shardGeometry(11, 10)
    const g = new THREE.BufferGeometry()
    g.index = base.index
    g.setAttribute('position', base.getAttribute('position'))
    g.setAttribute('normal', base.getAttribute('normal'))
    g.setAttribute('aA', new THREE.InstancedBufferAttribute(new Float32Array(MAX_GROUNDS * 4), 4))
    g.setAttribute('aB', new THREE.InstancedBufferAttribute(new Float32Array(MAX_GROUNDS * 4), 4))
    g.setAttribute('aC', new THREE.InstancedBufferAttribute(new Float32Array(MAX_GROUNDS * 4), 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 8)
    return g
  }, [])

  const tp = useMemo(() => pose(), [])
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const qq = useMemo(() => new THREE.Quaternion(), [])
  const v = useMemo(() => new THREE.Vector3(), [])
  const s3 = useMemo(() => new THREE.Vector3(), [])
  const right = useMemo(() => new THREE.Vector3(), [])
  const up = useMemo(() => new THREE.Vector3(), [])
  const fwd = useMemo(() => new THREE.Vector3(), [])
  const zero = useMemo(() => new THREE.Matrix4().makeScale(0, 0, 0), [])

  useFrame(() => {
    const on = jf.active
    const t = jf.t
    if (on && run.current !== journey.runs) {
      run.current = journey.runs
      buildRun()
    }

    // ── Hero bean: whole until the fracture ───────────────────────
    const showBean = on && t > CUES.bean_drop - 0.3 && t < CUES.bean_fracture
    beanRef.current.visible = showBean
    if (showBean) {
      heroBean(t, tp)
      beanRef.current.position.copy(tp.p)
      beanRef.current.quaternion.copy(tp.q)
      bean.uniforms.uCrack.value = crackL0(t)
    }
    // ── First-level pieces ─────────────────────────────────────────
    const showL1 = on && t >= CUES.bean_fracture && t < CUES.fragments_split
    for (let i = 0; i < l1Refs.current.length; i++) {
      const mesh = l1Refs.current[i]
      mesh.visible = showL1
      if (!showL1) continue
      fragment1(i, t, tp)
      mesh.position.copy(tp.p)
      mesh.quaternion.copy(tp.q)
      l1[i].uniforms.uCrack.value = crackL1(t)
    }
    // ── Second-level pieces; one of them becomes the subject ───────
    const showL2 = on && t >= CUES.fragments_split && t < CUES.scale_reveal + 4
    for (let j = 0; j < l2Refs.current.length; j++) {
      const mesh = l2Refs.current[j]
      const isSubject = j === plan.subject
      // Others leave down the gap; hide them once deep in it (dark, out of focus).
      const visible = showL2 && (isSubject || t < CUES.grounds_release - 1)
      mesh.visible = visible
      if (!visible) continue
      if (isSubject) subject(t, tp)
      else fragment2(j, t, tp)
      mesh.position.copy(tp.p)
      mesh.quaternion.copy(tp.q)
      mesh.scale.setScalar(tp.s)
      if (!isSubject && tp.p.y < RING_BOTTOM + 0.15) mesh.visible = false
    }

    // ── Context beans ──────────────────────────────────────────────
    const showCtx = on && t > CUES.bean_drop - 0.8 && t < CUES.grounds_release
    ctx.current.visible = showCtx
    if (showCtx) {
      for (let i = 0; i < CONTEXT.length; i++) {
        const c = CONTEXT[i]
        const t0 = CUES.bean_drop + c.dt
        const dTau = Math.max(0, tau(t) - tau(t0))
        const restY = RING_TOP + 0.16
        const h = 9.25 - restY
        const tFall = Math.sqrt((2 * h) / G)
        const k = clamp(dTau / tFall)
        if (t < t0) {
          ctx.current.setMatrixAt(i, zero)
          continue
        }
        const phi = plan.phiL + c.phi
        polar(phi, 1.45 + (c.r - 1.45) * Math.pow(k, 0.7), 9.25 - h * k * k, v)
        // Landed beans ride the blades round and sink into the gap.
        const tl = t0 + 0.1
        if (t > tl) {
          const dphi = 0.95 * (theta(t) - theta(tl))
          const a = angleOf(v) + dphi
          const y = v.y - 0.05 * Math.max(0, t - tl - 1.5) ** 2
          polar(a, Math.hypot(v.x, v.z), y, v)
        }
        qq.setFromAxisAngle(s3.set(0.5, 0.2, 0.8).normalize(), c.spin * (1 + k * 2.2) + i)
        m4.compose(v, qq, s3.setScalar(0.96 + (i % 3) * 0.04))
        ctx.current.setMatrixAt(i, m4)
      }
      ctx.current.instanceMatrix.needsUpdate = true
    }

    // ── Debris ─────────────────────────────────────────────────────
    const showDebris = on && t > CUES.bean_contact && t < CUES.grounds_release + 1
    chips.current.visible = chaff.current.visible = showDebris
    if (showDebris) {
      let ci = 0
      let fi = 0
      const maxChips = Math.min(q.journey.debris, chips.current.instanceMatrix.count)
      for (const d of debris.current) {
        const dTau = tau(t) - tau(d.t0)
        const target = d.chaff ? chaff.current : chips.current
        const idx = d.chaff ? fi++ : ci++
        if (!d.chaff && idx >= maxChips) continue
        if (dTau <= 0) {
          target.setMatrixAt(idx, zero)
          continue
        }
        const e = 1 - Math.exp(-d.k * dTau)
        v.copy(d.o).addScaledVector(d.v, e / d.k)
        v.y -= 0.5 * d.g * dTau * dTau
        // Carried round with the burr while in the gap.
        const dphi = 0.9 * (theta(t) - theta(d.t0))
        const a = angleOf(v) + dphi
        const r = Math.hypot(v.x, v.z)
        polar(a, r, v.y, v)
        qq.setFromAxisAngle(d.axis, d.w * dTau + (d.chaff ? Math.sin(dTau * 30) * 0.6 : 0))
        const gone = v.y < RING_BOTTOM - 0.4 ? 0 : 1
        m4.compose(v, qq, s3.setScalar(d.s * gone * smoothstep(0, 0.002, dTau)))
        target.setMatrixAt(idx, m4)
      }
      chips.current.count = Math.min(ci, maxChips)
      chaff.current.count = fi
      chips.current.instanceMatrix.needsUpdate = true
      chaff.current.instanceMatrix.needsUpdate = true
    }

    // ── Grounds ────────────────────────────────────────────────────
    const showGrounds = on && t > CUES.particle_follow && t < 33 && jf.dist < 40
    groundsMesh.current.visible = showGrounds
    grounds.uniforms.uTau.value = jf.tau

    // ── Macro practicals: a raking key from above-left of the lens, a warm rim behind
    //    the subject. They exist (at zero) all along, so no shader ever recompiles. ──
    const m = on ? jf.macro : 0
    const d = Math.max(jf.dist, 0.3)
    camera.matrixWorld.extractBasis(right, up, fwd)
    probe.current.intensity = 1.5 * m * jf.probe
    probe.current.distance = d * 5
    probe.current.position.copy(camera.position).addScaledVector(right, -0.7 * d).addScaledVector(up, 0.85 * d).addScaledVector(fwd, -0.2 * d)
    v.fromArray(jf.subject)
    rim.current.intensity = 1.6 * m * jf.rim
    rim.current.distance = d * 2.6
    rim.current.position.copy(v).addScaledVector(fwd, -0.9 * d).addScaledVector(up, 0.55 * d).addScaledVector(right, 0.5 * d)
  })

  return (
    <group>
      <mesh ref={beanRef} geometry={f.bean} material={bean.material} castShadow receiveShadow visible={false} raycast={noRaycast} />
      {f.l1.map((c, i) => (
        <mesh
          key={`a${i}`}
          ref={(el) => {
            if (el) l1Refs.current[i] = el
          }}
          geometry={c.geometry}
          material={l1[i].material}
          castShadow
          receiveShadow
          visible={false}
          raycast={noRaycast}
        />
      ))}
      {f.l2.map((c, j) => (
        <mesh
          key={`b${j}`}
          ref={(el) => {
            if (el) l2Refs.current[j] = el
          }}
          geometry={c.geometry}
          material={l2.material}
          castShadow
          receiveShadow
          visible={false}
          raycast={noRaycast}
        />
      ))}
      <instancedMesh ref={ctx} args={[ctxGeo, ctxMat, 6]} castShadow receiveShadow frustumCulled={false} visible={false} raycast={noRaycast} />
      <instancedMesh ref={chips} args={[shard, chipMat, 200]} frustumCulled={false} visible={false} raycast={noRaycast} />
      <instancedMesh ref={chaff} args={[flake, chaffMat, 24]} frustumCulled={false} visible={false} raycast={noRaycast} />
      <instancedMesh
        ref={groundsMesh}
        args={[groundsGeo, grounds.material, MAX_GROUNDS]}
        frustumCulled={false}
        visible={false}
        raycast={noRaycast}
      />
      <pointLight ref={probe} color="#fff4e6" intensity={0} decay={0} distance={4} />
      <pointLight ref={rim} color="#ffd9a8" intensity={0} decay={0} distance={4} />
    </group>
  )
}

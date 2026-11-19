import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { Grinder } from '../models/Grinder'
import { Studio } from './Studio'
import { Director } from './Director'
import { Effects } from './Effects'
import { CalloutProjector } from './CalloutProjector'
import { createFrameMonitor, initQuality, quality, useQuality } from '../config/quality'
import { emit, runtime } from '../state/runtime'
import { jf, journey } from '../journey/state'

/** Marks the scene ready once shaders are compiled and a few frames have landed. */
function Readiness() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    let frames = 0
    let raf = 0
    // Compile every material now — including parts that start hidden (internals,
    // beans, grounds) — so the first X-ray or grind never hitches on a shader build.
    // Programs depend on the number of active lights, so compile both light states:
    // as the scene usually is (the accent light off) and with every light on (Inspect).
    const hidden: THREE.Object3D[] = []
    const hiddenLights: THREE.Object3D[] = []
    const culled: THREE.Object3D[] = []
    scene.traverse((o) => {
      if (!o.visible) {
        if ((o as THREE.Light).isLight) hiddenLights.push(o)
        else {
          hidden.push(o)
          o.visible = true
        }
      }
      if (o.frustumCulled) {
        culled.push(o)
        o.frustumCulled = false
      }
    })
    // An unseen render as well as compile(): it also builds the shadow-pass programs
    // (instanced and custom-depth variants), so Inside the Grind never stalls the first
    // time a bean or the macro burr enters the key light.
    // Into a linear half-float target, as the composer renders the scene: programs are
    // keyed on the output colour space, and the canvas variant is never used.
    // three r187 replaces PCFSoft with PCF at its first shadow render; settle it now so
    // programs compiled here carry the shadow type they will actually be drawn with.
    gl.shadowMap.type = THREE.PCFShadowMap
    const rt = new THREE.WebGLRenderTarget(64, 64, { type: THREE.HalfFloatType })
    const prev = gl.getRenderTarget()
    gl.setRenderTarget(rt)
    gl.compile(scene, camera)
    gl.render(scene, camera)
    hiddenLights.forEach((o) => (o.visible = true))
    gl.compile(scene, camera)
    gl.render(scene, camera)
    hiddenLights.forEach((o) => (o.visible = false))
    gl.setRenderTarget(prev)
    rt.dispose()
    hidden.forEach((o) => (o.visible = false))
    culled.forEach((o) => (o.frustumCulled = true))
    const tick = () => {
      frames++
      if (frames < 6) raf = requestAnimationFrame(tick)
      else {
        runtime.ready = true
        runtime.introStart = performance.now() + 250
        emit()
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [gl, scene, camera])
  return null
}

/** Watches real frame times and lets the quality tier follow them. */
function Adaptive() {
  const monitor = useMemo(() => createFrameMonitor(), [])
  useFrame((_, dt) => {
    if (runtime.ready) monitor.tick(dt * 1000, document.hidden)
    if (import.meta.env.DEV) Object.assign(window, { __quality: quality.get(), __frameMs: monitor.last, __setTier: quality.set })
  })
  return null
}

export default function Experience() {
  // Initial tier is estimated once; after that the monitor drives it.
  const initial = useMemo(() => initQuality(), [])
  const q = useQuality()
  // Depth of field exists only during the film; it is mounted as the lights go down.

  return (
    <Canvas
      className="stage-canvas"
      dpr={Math.min(window.devicePixelRatio || 1, initial.dprCap)}
      shadows={{ type: THREE.PCFShadowMap }}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, alpha: false }}
      camera={{ fov: 20, near: 4, far: 900, position: [0, 15, 60] }}
      flat
      onCreated={({ gl }) => {
        gl.outputColorSpace = THREE.SRGBColorSpace
      }}
    >
      <Adaptive />
      <Director />
      <Suspense fallback={null}>
        <Studio />
        <Grinder detail={initial.detail} />
        <FilmEffects ao={q.ao} grain={q.grain} dof={q.dof} dprCap={q.dprCap} filmDpr={q.filmDpr} />
        <Snapshot />
        <Readiness />
      </Suspense>
      <CalloutProjector />
    </Canvas>
  )
}

/**
 * Reduced-motion crossfades: when the film asks for it, hand over the frame that was
 * just presented (after post-processing) as an image, so the next still can be revealed
 * underneath it.
 */
function Snapshot() {
  const gl = useThree((s) => s.gl)
  useFrame(() => {
    const cb = journey.snapshot
    if (!cb) return
    journey.snapshot = null
    let url = ''
    try {
      url = gl.domElement.toDataURL('image/jpeg', 0.86)
    } catch {
      url = ''
    }
    cb(url)
  }, 2)
  return null
}

/**
 * Depth of field exists only during the film. Mounting or removing it rebuilds the
 * composer's shader — a stall of a frame or two — so both happen where nobody can see:
 * it comes in once the lights are down, and leaves under the skip veil or, after
 * Continue, once the site's camera has come to rest.
 */
function FilmEffects({ ao, grain, dof, dprCap, filmDpr }: { ao: boolean; grain: boolean; dof: number; dprCap: number; filmDpr: number }) {
  const [on, setOn] = useState(false)
  // Pixel ratio follows the tier, and the film's own cap while it plays; it changes at
  // the same hidden moments as the depth of field.
  const setDpr = useThree((s) => s.setDpr)
  useEffect(() => {
    setDpr(Math.min(window.devicePixelRatio || 1, dprCap, on ? filmDpr : Infinity))
  }, [on, dprCap, filmDpr, setDpr])
  const timer = useRef(0)
  useFrame(() => {
    const want = jf.active && (journey.stills || journey.t > 0.9)
    // Quality changes may land only in the blackout; after it they wait for the exit.
    if (jf.active) quality.hold(journey.t > 1.3 || journey.stills)
    if (want) {
      if (timer.current) {
        clearTimeout(timer.current)
        timer.current = 0
      }
      if (!on) setOn(true)
    } else if (on && !jf.active && !timer.current) {
      timer.current = window.setTimeout(() => {
        timer.current = 0
        if (jf.active) return
        setOn(false)
        quality.hold(false)
      }, journey.exit === 'skip' ? 0 : 3200)
    }
  })
  useEffect(() => () => clearTimeout(timer.current), [])
  return <Effects ao={ao} grain={grain} dof={on ? dof : 0} />
}

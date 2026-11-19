import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { DIM } from './parts'
import { sim } from '../scene/grindSim'
import { stage } from '../scene/stage'
import { getLibrary, withRepeat } from '../materials/materials'
import { clamp, smoothstep } from '../animation/motion'
import { useQuality } from '../config/quality'
import { beanGeometry as journeyBean } from '../journey/fracture'
import { makeBeanMaterial } from '../journey/materials'

/**
 * Beans → burr → grounds → cup. Art-directed, deterministic, GPU-friendly:
 *  - beans: one instanced mesh, positions from a fixed packing, animated per bean
 *  - grounds in flight: a point cloud whose motion is computed entirely in the
 *    vertex shader from (seed, time) — no per-frame CPU work
 *  - heap: one turned mound that rises with the grams ground
 */

/* ---------------------------- geometry ----------------------------- */

function heapGeometry() {
  // A soft mound: height 1 at the centre, settling to a rim against the cup wall.
  const pts: THREE.Vector2[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    const r = t * 2.04
    pts.push(new THREE.Vector2(r, 1 - 0.62 * t * t))
  }
  pts.unshift(new THREE.Vector2(0, 0))
  pts.push(new THREE.Vector2(2.04, 0))
  return new THREE.LatheGeometry(pts.reverse(), 64)
}

/** Fixed bean packing inside the hopper, sorted bottom-up. */
function packing(n: number) {
  let seed = 11
  const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  const out: { p: THREE.Vector3; q: THREE.Quaternion; s: number }[] = []
  const perLayer = 13
  for (let i = 0; i < n; i++) {
    const layer = Math.floor(i / perLayer)
    const a = ((i % perLayer) / perLayer) * Math.PI * 2 + layer * 0.55 + r() * 0.3
    const rad = 0.62 + ((i * 7) % 3) * 0.48 + r() * 0.18
    out.push({
      p: new THREE.Vector3(Math.sin(a) * rad, 9.0 + layer * 0.38 + r() * 0.16, Math.cos(a) * rad),
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler(r() * 6.28, r() * 6.28, r() * 6.28)),
      s: 0.92 + r() * 0.18,
    })
  }
  return out.sort((a, b) => a.p.y - b.p.y)
}

/* ---------------------------- particles ---------------------------- */

const particleVert = /* glsl */ `
  attribute vec4 aSeed;
  uniform float uTime;
  uniform float uFlow;
  uniform float uHeap;
  uniform float uTop;
  uniform float uScale;
  varying float vShade;
  varying float vAlive;
  void main() {
    float period = 0.62;
    float t = fract(uTime / period + aSeed.z) * period;
    float a = aSeed.x * 6.2831853 - 9.0 * t;        // carried round by the burr
    float r = mix(1.55, 2.0, aSeed.y) * (1.0 - 0.3 * t);
    float y = uTop - 0.5 * 120.0 * t * t;            // art-directed gravity
    float heapY = 0.45 + uHeap * (1.0 - 0.62 * pow(r / 2.04, 2.0));
    vAlive = step(aSeed.w, uFlow) * step(heapY, y);
    vec3 pos = vec3(sin(a) * r, max(y, heapY), cos(a) * r);
    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vAlive * mix(0.05, 0.11, fract(aSeed.x * 37.0)) * uScale / -mv.z;
    vShade = fract(aSeed.y * 53.0);
  }
`
const particleFrag = /* glsl */ `
  uniform vec3 uColor;
  varying float vShade;
  varying float vAlive;
  void main() {
    if (vAlive < 0.5) discard;
    vec2 c = gl_PointCoord - 0.5;
    float d = dot(c, c);
    if (d > 0.25) discard;
    // A broken face catches light; the rest stays dark roast.
    float lit = 0.55 + 0.75 * vShade * smoothstep(0.25, 0.0, d);
    gl_FragColor = vec4(uColor * lit, 1.0);
  }
`

export function Grounds() {
  const q = useQuality()
  const size = useThree((s) => s.size)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const dpr = useThree((s) => s.viewport.dpr)
  const lib = useMemo(() => getLibrary(), [])

  /* Beans */
  const MAX_BEANS = 84
  // The same bean as the film's hero, so the hopper holds up when the lens gets close.
  const beanGeo = useMemo(() => journeyBean(30, 22, true), [])
  const beanMat = useMemo(
    () => makeBeanMaterial().material,
    [],
  )
  const layout = useMemo(() => packing(MAX_BEANS), [])
  const beans = useRef<THREE.InstancedMesh>(null!)

  /* Particles */
  const MAX_PARTICLES = 1600
  const pointsGeo = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const seeds = new Float32Array(MAX_PARTICLES * 4)
    const pos = new Float32Array(MAX_PARTICLES * 3)
    let s = 7
    const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
    for (let i = 0; i < MAX_PARTICLES; i++) {
      seeds.set([r(), r(), r(), r() * 0.98 + 0.01], i * 4)
    }
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 4))
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 3, 0), 6)
    return g
  }, [])
  const pointsMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTime: { value: 0 },
          uFlow: { value: 0 },
          uHeap: { value: 0 },
          uTop: { value: 5.6 },
          uScale: { value: 800 },
          uColor: { value: new THREE.Color('#5a3a26') },
        },
        vertexShader: particleVert,
        fragmentShader: particleFrag,
      }),
    [],
  )
  useEffect(() => {
    pointsGeo.setDrawRange(0, q.particles)
  }, [q.particles, pointsGeo])

  /* Heap */
  const heapGeo = useMemo(() => heapGeometry(), [])
  const heapMat = useMemo(() => {
    const m = new THREE.MeshStandardMaterial({
      color: '#583b27',
      roughness: 1,
      normalMap: withRepeat(lib.blast.normal, 5, 5),
      normalScale: new THREE.Vector2(0.7, 0.7),
    })
    // Up close the mound must read as packed grains, at the grounds' own size: a cellular
    // pattern in world space (each cell its own shade and facet tilt, dark crevices
    // between), faded out by screen derivatives before it can alias. Inside the Grind
    // this is what the instanced carpet of grains blends into at its edges.
    m.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vHeapW;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHeapW = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          /* glsl */ `#include <common>
          varying vec3 vHeapW;
          vec2 hH2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
          float hFade; float hCell; float hEdge; vec2 hId; vec2 hR;`,
        )
        .replace(
          '#include <color_fragment>',
          /* glsl */ `#include <color_fragment>
          vec2 hp = vHeapW.xz / 0.034;
          vec2 hi = floor(hp);
          vec2 hf = fract(hp);
          float d1 = 8.0; float d2 = 8.0; hId = vec2(0.0);
          for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
            vec2 g = vec2(float(x), float(y));
            vec2 r = g + hH2(hi + g) - hf;
            float d = dot(r, r);
            if (d < d1) { d2 = d1; d1 = d; hId = hi + g; hR = r; } else if (d < d2) { d2 = d; }
          }
          hFade = 1.0 - smoothstep(0.1, 0.35, length(fwidth(hp)));
          hCell = hH2(hId).x;
          hEdge = smoothstep(0.0, 0.16, sqrt(d2) - sqrt(d1));
          // Each cell is a rounded grain: shade falls off toward its rim, crevices go dark.
          vec3 grain = hCell > 0.88 ? vec3(0.42) : vec3(0.78 + 0.44 * hCell);
          float dome = 1.0 - smoothstep(0.15, 0.75, sqrt(d1));
          diffuseColor.rgb *= mix(vec3(1.0), grain * mix(0.62, 1.0, hEdge) * (0.8 + 0.2 * dome), hFade);`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          /* glsl */ `#include <normal_fragment_maps>
          // Normal leans out from the grain's centre (a cap), plus a little per-grain tilt.
          vec2 hT = -hR * 1.6 + (hH2(hId + 7.0) - 0.5) * 0.5;
          normal = normalize(normal + (viewMatrix * vec4(hT.x, 0.0, hT.y, 0.0)).xyz * hFade);`,
        )
    }
    m.customProgramCacheKey = () => 'heap-v5'
    return m
  }, [lib])
  const heap = useRef<THREE.Mesh>(null!)
  const points = useRef<THREE.Points>(null!)
  const m4 = useMemo(() => new THREE.Matrix4(), [])
  const v3 = useMemo(() => new THREE.Vector3(), [])
  const s3 = useMemo(() => new THREE.Vector3(), [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    // Point size in pixels per cm at unit depth.
    pointsMat.uniforms.uScale.value = (size.height * dpr * 0.5) / Math.tan((camera.fov * Math.PI) / 360)
    pointsMat.uniforms.uTime.value = t
    pointsMat.uniforms.uFlow.value = stage.flow
    const heapH = Math.min(4.1, stage.heap * 0.17)
    pointsMat.uniforms.uHeap.value = heapH
    pointsMat.uniforms.uTop.value = DIM.innerBurrY - 0.1 - stage.gap
    points.current.visible = stage.flow > 0.002

    heap.current.visible = heapH > 0.01 && stage.sweep > 1
    heap.current.scale.set(1, Math.max(0.001, heapH), 1)

    // Beans: pour in, then sink into the burr as the grind progresses.
    const n = Math.min(q.beans, MAX_BEANS)
    const show = sim.beans > 0 && stage.sweep > 12
    beans.current.visible = show
    if (!show) return
    const top = layout[n - 1].p.y
    const drop = sim.progress * (top - 8.55 + 0.5)
    for (let i = 0; i < n; i++) {
      const b = layout[i]
      // Pour: bean i falls from just under the dial, staggered bottom-first.
      const start = (i / n) * 0.62
      const f = clamp((sim.load - start) / 0.38)
      const fall = f * f // accelerating under gravity
      let y = THREE.MathUtils.lerp(14.2, b.p.y, fall) - drop
      let sc = f > 0 ? b.s : 0
      if (y < 8.95) {
        sc *= smoothstep(8.25, 8.95, y)
        y = Math.max(y, 8.25)
      }
      v3.set(b.p.x * (1 - 0.15 * (1 - f)), y, b.p.z * (1 - 0.15 * (1 - f)))
      s3.setScalar(Math.max(sc, 0.0001))
      m4.compose(v3, b.q, s3)
      beans.current.setMatrixAt(i, m4)
    }
    beans.current.count = n
    beans.current.instanceMatrix.needsUpdate = true
  })

  return (
    <group>
      <instancedMesh ref={beans} args={[beanGeo, beanMat, MAX_BEANS]} frustumCulled={false} castShadow={false} />
      <points ref={points} geometry={pointsGeo} material={pointsMat} frustumCulled={false} />
      <mesh ref={heap} geometry={heapGeo} material={heapMat} position-y={0.45} />
    </group>
  )
}

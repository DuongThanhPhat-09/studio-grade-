import * as THREE from 'three'
import { beadBlast, brushed, knurl, woodGrain } from './textures'
import type { BodyFinish, BurrFinish, KnobWood } from '../content/copy'

/**
 * Material library.
 *
 * Values are chosen against reference behaviour:
 *  - Bead-blasted 6061: bright, neutral-cool metal, soft but defined highlights.
 *  - Hard anodised: a dye in a clear oxide — dim body colour, pale grazing sheen (clearcoat).
 *  - Stainless: darker and warmer than aluminium; lathe-faced parts show the radial
 *    "machined" highlight via anisotropy along the turning direction.
 *  - Wood, oiled: low sheen, pores stay matte. Species is a tint over neutral grain.
 *  - Burr coatings: TiN gold, bare steel, or DLC near-black.
 *
 * Every part gets its own material instance (see Grinder) so it can be dimmed,
 * ghosted or refinished independently. Parameters animate toward targets.
 */

/** A finish is the set of parameters a configurator choice changes. */
export interface Finish {
  color: string
  metalness: number
  roughness: number
  clearcoat: number
  clearcoatRoughness: number
}

export const BODY_FINISH: Record<BodyFinish, Finish> = {
  // roughness here multiplies a bead-blast map averaging ~0.5
  silver: { color: '#dcdad6', metalness: 1, roughness: 0.62, clearcoat: 0, clearcoatRoughness: 0.4 },
  black: { color: '#1d1d1f', metalness: 0.3, roughness: 1.15, clearcoat: 0.18, clearcoatRoughness: 0.62 },
  titanium: { color: '#a29b91', metalness: 1, roughness: 0.74, clearcoat: 0, clearcoatRoughness: 0.4 },
  forest: { color: '#2b3a30', metalness: 0.55, roughness: 0.86, clearcoat: 0.55, clearcoatRoughness: 0.34 },
}

export const BURR_FINISH: Record<BurrFinish, Finish> = {
  gold: { color: '#c9a66b', metalness: 1, roughness: 0.3, clearcoat: 0, clearcoatRoughness: 0.4 },
  steel: { color: '#b8b7b3', metalness: 1, roughness: 0.27, clearcoat: 0, clearcoatRoughness: 0.4 },
  dark: { color: '#2c2c30', metalness: 1, roughness: 0.32, clearcoat: 0.3, clearcoatRoughness: 0.3 },
}

export const KNOB_FINISH: Record<KnobWood, Finish> = {
  walnut: { color: '#8f5f40', metalness: 0, roughness: 1, clearcoat: 0.22, clearcoatRoughness: 0.45 },
  oak: { color: '#d8b07a', metalness: 0, roughness: 1, clearcoat: 0.16, clearcoatRoughness: 0.5 },
  blackwood: { color: '#3b2a22', metalness: 0, roughness: 0.9, clearcoat: 0.3, clearcoatRoughness: 0.38 },
}

/* ------------------------------------------------------------------ */
/* X-ray ghost                                                          */
/* ------------------------------------------------------------------ */

/**
 * Shared uniforms for every shell material. Below the section plane `uSweep`
 * (world cm) the shell turns to ghosted glass: nearly clear where you look
 * straight through, denser at grazing angles, and it keeps its specular
 * highlights — which is what makes it read as a physical object and not a
 * wireframe. A thin warm line marks the plane while it moves.
 */
export const ghostUniforms = {
  uSweep: { value: -10 },
  uEdge: { value: 0 },
  /** Surfaces closer to the lens than x dissolve completely, by y they are whole (cm). */
  uNear: { value: new THREE.Vector2(0, 0) },
}

/** Opacity per shell group: the body can vanish entirely at macro scale while the cup stays glass. */
export const shellAlpha = {
  body: { value: 1 },
  cup: { value: 1 },
}

export function makeGhost(m: THREE.MeshPhysicalMaterial, group: keyof typeof shellAlpha = 'body') {
  m.transparent = true
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uSweep = ghostUniforms.uSweep
    shader.uniforms.uEdge = ghostUniforms.uEdge
    shader.uniforms.uNear = ghostUniforms.uNear
    shader.uniforms.uShellAlpha = shellAlpha[group]
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvGhostY = (modelMatrix * vec4(transformed, 1.0)).y;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vGhostY;\nuniform float uSweep;\nuniform float uEdge;\nuniform vec2 uNear;\nuniform float uShellAlpha;')
      .replace(
        '#include <opaque_fragment>',
        /* glsl */ `#include <opaque_fragment>
        float ghost = 1.0 - smoothstep(uSweep - 0.22, uSweep + 0.22, vGhostY);
        if (ghost > 0.001) {
          float ndv = abs(dot(normal, normalize(vViewPosition)));
          float fres = pow(1.0 - ndv, 2.4);
          float lum = dot(gl_FragColor.rgb, vec3(0.299, 0.587, 0.114));
          float a = clamp(0.03 + fres * 0.5 + smoothstep(0.25, 1.2, lum) * 0.55, 0.0, 1.0);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * 0.9 + vec3(0.008, 0.009, 0.011), ghost);
          gl_FragColor.a *= mix(1.0, a, ghost);
        }
        float edge = exp(-pow((vGhostY - uSweep) / 0.05, 2.0)) * uEdge;
        gl_FragColor.rgb += vec3(1.0, 0.8, 0.56) * edge * 0.75;
        gl_FragColor.a = max(gl_FragColor.a, edge * 0.85);
        // Inside the Grind: the lens passes through glass without ever clipping it.
        gl_FragColor.a *= uShellAlpha * smoothstep(uNear.x, uNear.y, length(vViewPosition));`,
      )
  }
  m.customProgramCacheKey = () => 'ghost-v2'
  return m
}

/* ------------------------------------------------------------------ */
/* Base library                                                         */
/* ------------------------------------------------------------------ */

export type Library = ReturnType<typeof createLibrary>
let cache: Library | null = null
export function getLibrary() {
  if (!cache) cache = createLibrary()
  return cache
}

export function withRepeat<T extends THREE.Texture>(t: T, x: number, y: number): T {
  const c = t.clone() as T
  c.repeat.set(x, y)
  c.needsUpdate = true
  return c
}

function applyFinish(m: THREE.MeshPhysicalMaterial, f: Finish) {
  m.color.set(f.color)
  m.metalness = f.metalness
  m.roughness = f.roughness
  m.clearcoat = f.clearcoat
  m.clearcoatRoughness = f.clearcoatRoughness
}

function createLibrary() {
  const blast = beadBlast()
  const knurlTex = knurl()
  const brush = brushed()
  const wood = woodGrain()

  const aluminium = (repeatU: number, repeatV: number) => {
    const m = new THREE.MeshPhysicalMaterial({
      roughnessMap: withRepeat(blast.roughness, repeatU, repeatV),
      normalMap: withRepeat(blast.normal, repeatU, repeatV),
      normalScale: new THREE.Vector2(0.11, 0.11),
    })
    applyFinish(m, BODY_FINISH.silver)
    return m
  }

  const anodised = () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#2a2a2c'),
      metalness: 0.55,
      roughness: 0.42,
      clearcoat: 0.55,
      clearcoatRoughness: 0.38,
      normalMap: withRepeat(blast.normal, 10, 2),
      normalScale: new THREE.Vector2(0.05, 0.05),
    })

  const steelBrushed = () =>
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#bdbbb6'),
      metalness: 1,
      roughness: 0.5,
      roughnessMap: withRepeat(brush.roughness, 1, 3),
      normalMap: withRepeat(brush.normal, 1, 3),
      normalScale: new THREE.Vector2(0.06, 0.06),
      anisotropy: 0.65,
    })

  const steelTurned = () =>
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#c4c2bd'), metalness: 1, roughness: 0.22, anisotropy: 0.75 })
  const steelPolished = () =>
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#c9c7c2'), metalness: 1, roughness: 0.14 })
  const steelBearing = () =>
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#b9b8b4'), metalness: 1, roughness: 0.26 })
  const rubber = () => new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#161616'), metalness: 0, roughness: 0.62 })

  const knob = () => {
    const m = new THREE.MeshPhysicalMaterial({
      map: wood.map,
      roughnessMap: wood.roughness,
      normalMap: wood.normal,
      normalScale: new THREE.Vector2(0.35, 0.35),
      sheen: 0.15,
      sheenRoughness: 0.6,
      sheenColor: new THREE.Color('#8a6a52'),
    })
    applyFinish(m, KNOB_FINISH.walnut)
    return m
  }

  const burr = () => {
    const m = new THREE.MeshPhysicalMaterial()
    applyFinish(m, BURR_FINISH.gold)
    return m
  }

  return {
    blast,
    knurlTex,
    aluminium,
    anodised,
    steelBrushed,
    steelTurned,
    steelPolished,
    steelBearing,
    rubber,
    knob,
    burr,
  }
}

/* ------------------------------------------------------------------ */
/* Animated material state                                              */
/* ------------------------------------------------------------------ */

const tmp = new THREE.Color()

/**
 * Wraps a material with a target finish and a "presence" (1 = normal,
 * < 1 dimmed, > 1 emphasised). Both ease toward their targets every frame.
 */
export class LiveMaterial {
  base: THREE.Color
  target: Finish
  presence = 1
  presenceTarget = 1
  constructor(public m: THREE.MeshPhysicalMaterial) {
    this.base = m.color.clone()
    this.target = {
      color: '#' + m.color.getHexString(),
      metalness: m.metalness,
      roughness: m.roughness,
      clearcoat: m.clearcoat,
      clearcoatRoughness: m.clearcoatRoughness,
    }
  }
  setFinish(f: Finish) {
    this.target = f
  }
  update(dt: number, rate = 5) {
    const k = 1 - Math.exp(-rate * dt)
    tmp.set(this.target.color)
    this.base.lerp(tmp, k)
    const m = this.m
    m.metalness += (this.target.metalness - m.metalness) * k
    m.roughness += (this.target.roughness - m.roughness) * k
    m.clearcoat += (this.target.clearcoat - m.clearcoat) * k
    m.clearcoatRoughness += (this.target.clearcoatRoughness - m.clearcoatRoughness) * k
    this.presence += (this.presenceTarget - this.presence) * (1 - Math.exp(-4.5 * dt))
    // Dimming darkens colour (works for metal reflectance and dielectric albedo alike);
    // emphasis lifts reflections rather than colour, which would wash the finish out.
    const p = this.presence
    m.color.copy(this.base).multiplyScalar(Math.min(1, p))
    m.envMapIntensity = p > 1 ? p : 0.35 + 0.65 * p
  }
}

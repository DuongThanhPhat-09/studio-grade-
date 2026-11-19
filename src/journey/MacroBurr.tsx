import { useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '../config/quality'
import { DIM } from '../models/parts'
import { stage } from '../scene/stage'
import { jf } from './state'

/**
 * The burr at macro scale.
 *
 * The product meshes are fine at arm's length, but a lens 8 mm from a tooth would see
 * every facet. Instead of one impossibly dense mesh, a *window* of the burr is evaluated
 * on the GPU, from the same tooth profile the meshes are built from:
 *
 *  - a grid (angle × profile) whose vertices are placed in the vertex shader; the window
 *    follows the camera's azimuth and is foveated (denser where the lens looks)
 *  - the cone's rotation is a uniform, so the teeth slide through a window that stays put
 *  - normals by central differences, which also gives every crest a honed edge: a hair of
 *    rounding that catches a highlight, as a precision-ground edge does
 *  - fine grinding marks along each tooth: roughness and a tiny bump, faded out by screen
 *    derivatives before they can alias
 *  - the stationary ring can be opened as a cutaway: a wedge around the line of sight is
 *    removed, and back faces seen through the opening are shaded as the radial section
 *    faces (thin gold walls framing the gap, as in a technical cutaway drawing)
 *
 * The meshes and the window describe the same surface, so the swap (made at ~7 cm, while
 * the lens is moving) is invisible; the micro detail then fades in.
 */

const GLSL = /* glsl */ `
  uniform float uCenter;
  uniform float uHalf;
  uniform float uPow;
  uniform float uRot;
  attribute vec2 aGrid;
  varying float vMark;
  varying float vMarkAmp;
  varying vec3 vJWorld;

  float jTooth(float p, float rake) {
    const float K = 0.1;
    float f = fract(p);
    float a = f / rake;
    float b = (1.0 - f) / (1.0 - rake);
    float h = max(K - abs(a - b), 0.0) / K;
    float crest = min(a, b) - h * h * K * 0.25;
    float g = fract(p + 0.5) - 0.5;
    float ra = g / rake;
    float rb = -g / (1.0 - rake);
    float h2 = max(K - abs(ra - rb), 0.0) / K;
    float root = max(ra, rb) + h2 * h2 * K * 0.25;
    return abs(g) < 0.5 * min(rake, 1.0 - rake) ? root : crest;
  }

#ifdef CONE
  float coneR(float u, float v) {
    float y = v * 2.3;
    float base = 2.05 - 1.08 * pow(max(v, 0.0), 1.12);
    float fineDepth = 0.075 * (1.0 - smoothstep(0.55, 0.95, v));
    float bladeDepth = 0.34 * smoothstep(0.25, 0.8, v);
    float fine = jTooth(u * 28.0 + y * 0.42, 0.22);
    float blade = jTooth(u * 6.0 - y * 0.32, 0.3);
    return base - fineDepth * (1.0 - fine) - bladeDepth * (1.0 - blade);
  }
  vec3 surf(float phi, float s) {
    float u = (phi - uRot) / 6.28318530718;
    float r;
    float y;
    if (s < 0.08) { r = mix(0.32, coneR(u, 0.0), s / 0.08); y = 0.0; }
    else if (s < 0.92) { float v = (s - 0.08) / 0.84; r = coneR(u, v); y = v * 2.3; }
    else { r = mix(coneR(u, 1.0), 0.32, (s - 0.92) / 0.08); y = 2.3; }
    return vec3(sin(phi) * r, y, cos(phi) * r);
  }
  float mark(float phi, float s, vec3 p) {
    float u = (phi - uRot) / 6.28318530718;
    if (s < 0.08 || s > 0.92) return length(p.xz) * 340.0;
    float v = (s - 0.08) / 0.84;
    return v > 0.42 ? (u * 6.0 - p.y * 0.32) * 520.0 : (u * 28.0 + p.y * 0.42) * 120.0;
  }
#else
  float ringIn(float u, float v) { return 2.12 + 0.06 * v + 0.07 * (1.0 - jTooth(u * 42.0 + v * 0.35, 0.6)); }
  vec3 surf(float phi, float s) {
    float u = phi / 6.28318530718;
    float r;
    float y;
    if (s < 0.14) { y = s / 0.14 * 1.45; r = 2.36; }
    else if (s < 0.24) { r = mix(2.36, ringIn(u, 1.0), (s - 0.14) / 0.10); y = 1.45; }
    else if (s < 0.90) { float v = 1.0 - (s - 0.24) / 0.66; r = ringIn(u, v); y = v * 1.45; }
    else { r = mix(ringIn(u, 0.0), 2.36, (s - 0.90) / 0.10); y = 0.0; }
    return vec3(sin(phi) * r, y, cos(phi) * r);
  }
  float mark(float phi, float s, vec3 p) {
    float u = phi / 6.28318530718;
    if (s < 0.14) return p.y * 360.0;
    if (s < 0.24 || s > 0.90) return length(p.xz) * 340.0;
    float v = 1.0 - (s - 0.24) / 0.66;
    return (u * 42.0 + v * 0.35) * 110.0;
  }
#endif

  vec3 jPos;
  vec3 jNormal;
  void jEval() {
    float g = aGrid.x;
    float phi = uCenter + uHalf * sign(g) * pow(abs(g), uPow);
    float s = aGrid.y;
    const float dp = 0.0005;
    const float ds = 0.0012;
    jPos = surf(phi, s);
    vec3 tp = surf(phi + dp, s) - surf(phi - dp, s);
    vec3 ts = surf(phi, min(s + ds, 1.0)) - surf(phi, max(s - ds, 0.0));
    jNormal = normalize(cross(tp, ts));
    vMark = mark(phi, s, jPos);
    vMarkAmp = 1.0;
  }
`

const FRAG_HEAD = /* glsl */ `
  uniform float uDetail;
  uniform float uBump;
  uniform float uCutC;
  uniform float uCut;
  uniform float uCutEdge;
  varying float vMark;
  varying float vMarkAmp;
  varying vec3 vJWorld;
  // Precision-safe hash (no sin of large arguments, which bands into patterns).
  float jHash(float n) { n = fract(n * 0.1031); n *= n + 33.33; n *= n + n; return fract(n); }
  float jLines(float m) {
    float i = floor(m);
    float f = fract(m);
    return mix(jHash(i), jHash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }
  vec3 jPerturb(vec3 surfPos, vec3 n, vec2 dH, float fd) {
    vec3 sx = dFdx(surfPos);
    vec3 sy = dFdy(surfPos);
    vec3 r1 = cross(sy, n);
    vec3 r2 = cross(n, sx);
    float det = dot(sx, r1) * fd;
    vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
    return normalize(abs(det) * n - grad);
  }
`

function patch(m: THREE.Material, kind: 'cone' | 'ring', uniforms: Record<string, THREE.IUniform>, depth = false) {
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.defines = { ...(shader.defines ?? {}), ...(kind === 'cone' ? { CONE: '' } : {}) }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${GLSL}`)
      .replace('#include <beginnormal_vertex>', 'jEval();\nvec3 objectNormal = jNormal;\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(1.0, 0.0, 0.0);\n#endif')
      .replace('#include <begin_vertex>', depth ? 'jEval();\nvec3 transformed = jPos;' : 'vec3 transformed = jPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvJWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
    if (depth) return
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_HEAD}`)
      .replace(
        '#include <clipping_planes_fragment>',
        /* glsl */ `#include <clipping_planes_fragment>
        // Cutaway: a wedge of the ring around the line of sight opens as uCut rises.
        float jCutD = 1e3;
        float jSide = 1.0;
        float jDphi = atan(vJWorld.x, vJWorld.z) - uCutC;
        jDphi = mod(jDphi + 3.14159265, 6.2831853) - 3.14159265;
        jSide = jDphi >= 0.0 ? 1.0 : -1.0;
        if (uCut > 0.001) {
          jCutD = (uCut - abs(jDphi)) * length(vJWorld.xz);
          if (jCutD > 0.0) discard;
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        // Each octave fades on its own footprint, so neither can alias.
        float jW = fwidth(vMark);
        float jFade = (1.0 - smoothstep(0.06, 0.22, jW)) * uDetail * vMarkAmp;
        float jFade2 = (1.0 - smoothstep(0.06, 0.22, jW * 3.7)) * uDetail * vMarkAmp;
        float jL = (jLines(vMark) - 0.5) * 0.65 * jFade + (jLines(vMark * 3.7 + 17.0) - 0.5) * 0.35 * jFade2;
        roughnessFactor = clamp(roughnessFactor * (1.0 + jL * 0.36), 0.05, 1.0);
        if (!gl_FrontFacing) roughnessFactor = max(roughnessFactor, 0.36);`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        float jH = jL;
        normal = jPerturb(-vViewPosition, normal, vec2(dFdx(jH), dFdy(jH)) * uBump, faceDirection);
        // Section cap: what shows through the cut is shaded as the cut face itself.
        if (!gl_FrontFacing) {
          float jB = uCutC + jSide * uCut;
          normal = normalize((viewMatrix * vec4(-jSide * cos(jB), 0.0, jSide * sin(jB), 0.0)).xyz);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        /* glsl */ `#include <emissivemap_fragment>
        totalEmissiveRadiance += vec3(1.0, 0.8, 0.56) * exp(-pow(jCutD / 0.0045, 2.0)) * uCutEdge * 0.9;`,
      )
  }
  m.customProgramCacheKey = () => `macro-${kind}-${depth ? 'd' : 'c'}-v2`
}

function grid(around: number, along: number) {
  const g = new THREE.BufferGeometry()
  const n = (around + 1) * (along + 1)
  const gridA = new Float32Array(n * 2)
  let k = 0
  for (let j = 0; j <= along; j++) {
    for (let i = 0; i <= around; i++) {
      gridA[k++] = (i / around) * 2 - 1
      gridA[k++] = j / along
    }
  }
  const idx: number[] = []
  for (let j = 0; j < along; j++) {
    for (let i = 0; i < around; i++) {
      const a = j * (around + 1) + i
      const b = a + 1
      const d = a + around + 1
      const c = d + 1
      idx.push(a, b, d, b, c, d)
    }
  }
  // Positions are placed in the shader; the attribute exists only for bookkeeping, and
  // being all zero, any override material (contact shadows) draws nothing.
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3))
  g.setAttribute('aGrid', new THREE.BufferAttribute(gridA, 2))
  g.setIndex(idx)
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 1, 0), 4)
  return g
}

const noRaycast = () => null

function useMacro(kind: 'cone' | 'ring') {
  return useMemo(() => {
    const uniforms = {
      uCenter: { value: 0 },
      uHalf: { value: Math.PI },
      uPow: { value: 1.4 },
      uRot: { value: 0 },
      uDetail: { value: 0 },
      uBump: { value: 0.0009 },
      uCutC: { value: 0 },
      uCut: { value: 0 },
      uCutEdge: { value: 0 },
    }
    const mat = new THREE.MeshPhysicalMaterial({ side: kind === 'ring' ? THREE.DoubleSide : THREE.FrontSide })
    patch(mat, kind, uniforms)
    const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking })
    patch(depth, kind, uniforms, true)
    return { uniforms, mat, depth }
  }, [kind])
}

const v = new THREE.Vector3()

function MacroSurface({ kind, source, position }: { kind: 'cone' | 'ring'; source: THREE.MeshPhysicalMaterial; position: number }) {
  const q = useQuality()
  const camera = useThree((s) => s.camera)
  const { uniforms, mat, depth } = useMacro(kind)
  const geo = useMemo(
    () => (kind === 'cone' ? grid(q.macro.around, q.macro.along) : grid(Math.round(q.macro.around * 0.8), Math.round(q.macro.along * 0.7))),
    [kind, q.macro.around, q.macro.along],
  )
  const mesh = useRef<THREE.Mesh>(null!)

  useFrame(() => {
    const m = mesh.current
    m.visible = jf.fine
    if (!jf.fine) return
    // The window faces the lens: camera azimuth in the parent's frame.
    m.parent!.worldToLocal(v.copy(camera.position))
    uniforms.uCenter.value = Math.atan2(v.x, v.z)
    uniforms.uRot.value = stage.crank
    uniforms.uDetail.value = jf.detail
    if (kind === 'ring') {
      uniforms.uCut.value = jf.cut.half
      uniforms.uCutEdge.value = jf.cut.edge
      uniforms.uCutC.value = jf.cut.center
    }
    // Same finish as the product's burr (configurator, presence).
    mat.color.copy(source.color)
    mat.metalness = source.metalness
    mat.roughness = source.roughness
    mat.clearcoat = source.clearcoat
    mat.clearcoatRoughness = source.clearcoatRoughness
    mat.envMapIntensity = source.envMapIntensity
  })

  return (
    <mesh
      ref={mesh}
      geometry={geo}
      material={mat}
      customDepthMaterial={depth}
      position-y={position}
      receiveShadow
      frustumCulled={false}
      visible={false}
      raycast={noRaycast}
    />
  )
}

/** Rotating cone window — mount inside the burr-gap group (not the spinning one). */
export const MacroCone = ({ source }: { source: THREE.MeshPhysicalMaterial }) => <MacroSurface kind="cone" source={source} position={DIM.innerBurrY} />
/** Stationary ring window — mount inside the outer-burr group. */
export const MacroRing = ({ source }: { source: THREE.MeshPhysicalMaterial }) => <MacroSurface kind="ring" source={source} position={0} />

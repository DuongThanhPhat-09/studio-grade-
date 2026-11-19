import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { ContactShadows, Environment, Lightformer } from '@react-three/drei'
import * as THREE from 'three'
import { stage } from './stage'
import { useQuality } from '../config/quality'

export const BG = '#0a0908'

/**
 * A product-photography studio, rebuilt in light.
 *
 * Reflections come from an environment made of softboxes (Lightformers), not an HDRI:
 *  - a large warm key, front-left and high — the main read on every metal surface
 *  - two tall strips behind left and right — the vertical rim lines on the turned body
 *  - a broad, dim overhead — separates the top faces
 *  - a faint low fill — keeps the shadow side from going to pure black
 * One real spot light adds the floor pool and the crank's shadow on the cap.
 * Rotating the environment (cheap: no re-render) produces the material light-sweep.
 */
export function Studio() {
  const quality = useQuality()
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const spot = useRef<THREE.SpotLight>(null!)
  const halo = useRef<THREE.Mesh>(null!)
  const haloMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color('#2f2b27') },
          uIntensity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uIntensity;
          void main() {
            vec2 p = (vUv - 0.5) * vec2(1.0, 1.35);
            float g = exp(-dot(p, p) * 16.0);
            // Ordered dither keeps a dark gradient free of banding.
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            vec3 c = uColor * g * uIntensity + (n - 0.5) / 512.0;
            gl_FragColor = vec4(max(c, 0.0), 1.0);
          }
        `,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        fog: false,
      }),
    [],
  )

  // The floor is light, not a surface: the key's pool, added onto the backdrop.
  // Being additive it can never form a visible horizon line against the background.
  const poolMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uColor: { value: new THREE.Color('#5a524a') }, uIntensity: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform vec3 uColor;
          uniform float uIntensity;
          void main() {
            // Pool offset toward the key (front-left), elongated away from it.
            vec2 p = (vUv - vec2(0.47, 0.52)) * vec2(1.0, 0.82);
            float g = exp(-dot(p, p) * 62.0);
            float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
            gl_FragColor = vec4(max(uColor * g * uIntensity + (n - 0.5) / 600.0, 0.0), 1.0);
          }
        `,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        fog: false,
      }),
    [],
  )

  const tmp = useMemo(() => new THREE.Vector3(), [])

  // Accent: a narrow spot that finds the part under inspection, like a hand-held fill.
  const accent = useRef<THREE.SpotLight>(null!)
  const accentTarget = useMemo(() => new THREE.Object3D(), [])

  // A new shadow-map size only takes effect once the old map is released.
  useEffect(() => {
    const sh = spot.current?.shadow
    if (!sh) return
    sh.mapSize.set(quality.shadowMap, quality.shadowMap)
    sh.map?.dispose()
    sh.map = null
  }, [quality.shadowMap])

  useFrame(() => {
    scene.environmentRotation.set(0, stage.envRot, 0)
    scene.environmentIntensity = stage.env
    spot.current.intensity = 3.4 * stage.key
    haloMat.uniforms.uIntensity.value = stage.halo
    poolMat.uniforms.uIntensity.value = stage.key * 0.7
    // The backdrop light always sits behind the subject, as a photographer would set it.
    // Lens shift moves the product off-centre, so aim from the camera through the product.
    tmp.set(0, 11, 0).sub(camera.position).normalize()
    halo.current.position.set(0, 11, 0).addScaledVector(tmp, 220)
    halo.current.quaternion.copy(camera.quaternion)

    const a = stage.accent
    accent.current.intensity = a.power * 2.6
    accent.current.visible = a.power > 0.01
    accentTarget.position.set(a.x, a.y, a.z)
    accent.current.position.set(a.x - 16, a.y + 24, a.z + 20)
  })

  return (
    <>
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 220, 620]} />

      <Environment resolution={quality.envRes} frames={1}>
        {/* Key softbox */}
        <Lightformer form="rect" intensity={2.4} color="#fff2e4" position={[-5, 3.2, 5]} scale={[9, 7, 1]} target={[0, 0, 0]} />
        {/* White card, camera-right: lifts the shadow side of the metal without flattening it */}
        <Lightformer form="rect" intensity={0.55} color="#f4f1ec" position={[6, 1.5, 6]} scale={[4, 9, 1]} target={[0, 0, 0]} />
        {/* Rim strips */}
        <Lightformer form="rect" intensity={7} color="#fff8f0" position={[-6.5, 0.5, -5]} scale={[0.6, 14, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={4.5} color="#eef2fa" position={[7, 0.8, -4]} scale={[0.45, 14, 1]} target={[0, 0, 0]} />
        {/* Overhead */}
        <Lightformer form="rect" intensity={1.7} color="#ffffff" position={[0, 8, 0]} scale={[7, 7, 1]} target={[0, 0, 0]} />
        {/* Low fill, right-front */}
        <Lightformer form="rect" intensity={0.28} color="#ffe9d6" position={[8, -1, 5]} scale={[5, 6, 1]} target={[0, 0, 0]} />
        {/* Floor bounce */}
        <Lightformer form="circle" intensity={0.08} color="#d8c7b4" position={[0, -8, 0]} scale={[14, 14, 1]} target={[0, 0, 0]} />
      </Environment>

      <spotLight
        ref={spot}
        position={[-34, 64, 40]}
        angle={0.36}
        penumbra={1}
        decay={0}
        intensity={0}
        color="#fff1e2"
        castShadow
        shadow-mapSize={[quality.shadowMap, quality.shadowMap]}
        shadow-bias={-0.00012}
        shadow-normalBias={0.025}
        shadow-radius={5}
        shadow-camera-near={40}
        shadow-camera-far={160}
      />

      <primitive object={accentTarget} />
      <spotLight ref={accent} target={accentTarget} angle={0.2} penumbra={1} decay={0} intensity={0} color="#fff6ea" visible={false} />

      <mesh ref={halo} renderOrder={-10} frustumCulled={false} material={haloMat}>
        <planeGeometry args={[240, 240]} />
      </mesh>

      <mesh rotation-x={-Math.PI / 2} position-y={0} renderOrder={-5} material={poolMat}>
        <planeGeometry args={[160, 160]} />
      </mesh>

      <ContactShadows
        position={[0, 0.02, 0]}
        scale={46}
        resolution={quality.contactRes}
        blur={2.2}
        far={16}
        opacity={0.9}
        color="#000000"
        frames={Infinity}
      />
    </>
  )
}

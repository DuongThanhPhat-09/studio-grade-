import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { DepthOfField, EffectComposer, N8AO, Noise, SMAA, ToneMapping, Vignette } from '@react-three/postprocessing'
import { BlendFunction, ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing'
import type * as THREE from 'three'
import { jf } from '../journey/state'

/**
 * Post-processing is limited to what a photograph would have anyway:
 *  - ambient occlusion where parts meet (seams, crank on cap, knob on arm)
 *  - a filmic tone curve that rolls highlights off instead of clipping
 *  - lens vignetting
 *  - fine grain, which also dithers the dark gradients
 *  - inside the Grind only: a real depth of field, focused on the subject, its depth
 *    shrinking with the lens distance as a macro lens's does
 * No bloom, no chromatic aberration.
 */

const TONE: Record<string, ToneMappingMode> = {
  agx: ToneMappingMode.AGX,
  aces: ToneMappingMode.ACES_FILMIC,
  neutral: ToneMappingMode.NEUTRAL,
}
// Dev-only A/B switch: ?tm=aces|agx|neutral
const tm = import.meta.env.DEV ? new URLSearchParams(location.search).get('tm') : null
// ACES: deepest blacks and the crispest roll-off on metal — chosen over AgX
// (washes the backdrop grey) and Neutral (drifts warm) in side-by-side renders.
const toneMode: ToneMappingMode = (tm ? TONE[tm] : undefined) ?? ToneMappingMode.ACES_FILMIC

type AOPass = { configuration: { aoRadius: number; distanceFalloff: number; intensity: number } }

export function Effects({ ao, grain, dof }: { ao: boolean; grain: boolean; dof: number }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const aoRef = useRef<AOPass>(null)
  const dofRef = useRef<DepthOfFieldEffect>(null)

  useFrame(() => {
    // AO radius is a world distance: scale it with the lens, or a 1.4 cm radius
    // would grey out an 8 mm frame.
    const a = aoRef.current
    if (a) {
      const k = jf.active ? Math.min(1, Math.max(0.012, jf.dist / 60)) : 1
      a.configuration.aoRadius = 1.4 * k
      a.configuration.distanceFalloff = 0.6 * k
    }
    const d = dofRef.current
    if (d) {
      d.cocMaterial.adoptCameraSettings(camera)
      d.cocMaterial.focusDistance = jf.focus
      d.cocMaterial.focusRange = jf.focusRange
      d.bokehScale = jf.bokeh * 5.5 * dof
    }
  })

  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <>{ao && <N8AO ref={aoRef as never} aoRadius={1.4} distanceFalloff={0.6} intensity={2.4} quality="medium" halfRes color="#000000" />}</>
      <>{dof > 0 && <DepthOfField ref={dofRef} focusDistance={60} focusRange={30} bokehScale={0} resolutionScale={dof >= 1 ? 0.5 : 0.4} />}</>
      <SMAA />
      <ToneMapping mode={toneMode} />
      <Vignette offset={0.28} darkness={0.55} />
      <>{grain && <Noise premultiply blendFunction={BlendFunction.SCREEN} opacity={0.22} />}</>
    </EffectComposer>
  )
}

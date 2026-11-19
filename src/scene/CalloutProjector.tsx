import { useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { anchors } from './anchors'
import { stage } from './stage'
import { runtime } from '../state/runtime'
import { store } from '../state/store'
import { beatIndex } from '../content/copy'
import { clamp, smoothstep } from '../animation/motion'
import { isPortrait } from '../config/quality'
import { CALLOUT_SETS } from '../ui/callouts'

/**
 * Projects anchors to screen space and writes straight to the DOM.
 * Leader lines run horizontally from each part's silhouette edge to a shared
 * label column, so labels align like a spec sheet rather than floating.
 */
export function CalloutProjector() {
  const camera = useThree((s) => s.camera)
  const size = useThree((s) => s.size)
  const v = useMemo(() => ({ right: new THREE.Vector3(), axis: new THREE.Vector3(), edge: new THREE.Vector3() }), [])

  useFrame(() => {
    const els = runtime.dom.callouts
    if (!els.size) return
    const portrait = isPortrait(size.width, size.height)
    const film = store.get().mode === 'film'
    camera.updateMatrixWorld()
    v.right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()

    for (const set of CALLOUT_SETS) {
      const on = film && runtime.activeSection === beatIndex[set.beat]
      const strength = !on
        ? 0
        : set.id === 'engineering'
          ? clamp((runtime.explode - 0.55) / 0.3)
          : smoothstep(14, 20, stage.sweep)
      const pts: { key: string; x: number; y: number }[] = []
      for (const item of set.items) {
        const el = els.get(`${set.id}:${item.anchor}`)
        const a = anchors.get(item.anchor)
        if (!el || !a) continue
        if (strength <= 0) {
          if (el.style.opacity !== '0') el.style.opacity = '0'
          continue
        }
        a.object.updateWorldMatrix(true, false)
        a.object.getWorldPosition(v.axis)
        v.edge.copy(v.axis).addScaledVector(v.right, a.radius + 0.25).project(camera)
        pts.push({ key: `${set.id}:${item.anchor}`, x: (v.edge.x * 0.5 + 0.5) * size.width, y: (-v.edge.y * 0.5 + 0.5) * size.height })
      }
      if (!pts.length) continue
      // Portrait: labels sit in a column at the right gutter instead of beside the part.
      const column = portrait ? size.width - 150 : Math.min(size.width - 280, Math.max(...pts.map((p) => p.x)) + size.width * 0.05)
      pts.forEach((p, i) => {
        const el = els.get(p.key)!
        const o = clamp(strength * 1.4 - i * 0.12)
        el.style.opacity = o.toFixed(3)
        el.style.transform = `translate3d(${p.x.toFixed(1)}px, ${p.y.toFixed(1)}px, 0)`
        el.style.setProperty('--len', `${Math.max(18, column - p.x).toFixed(1)}px`)
        el.style.setProperty('--draw', o.toFixed(3))
      })
    }
  })

  return null
}

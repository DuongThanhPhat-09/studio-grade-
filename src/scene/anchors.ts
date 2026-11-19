import * as THREE from 'three'
import type { PartId } from '../content/copy'

/** Points on the model that callouts and inspect shots attach to: an axis point plus the part's radius. */
export const anchors = new Map<PartId | 'hub', { object: THREE.Object3D; radius: number }>()

const v = new THREE.Vector3()
/** Current world position of a part's anchor (or null before mount). */
export function anchorWorld(part: PartId | 'hub', out = v) {
  const a = anchors.get(part)
  if (!a) return null
  a.object.updateWorldMatrix(true, false)
  return a.object.getWorldPosition(out)
}

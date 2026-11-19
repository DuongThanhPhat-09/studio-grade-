import * as THREE from 'three'
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * Crank arm: a tapered blade between a hub and an end boss, drawn as a 2D outline
 * with tangent-continuous curves and extruded with a generous rounded bevel —
 * the bevel is what catches the long highlight along the arm.
 */
export const CRANK = {
  length: 6.6,
  hubR: 0.78,
  endR: 0.5,
  thickness: 0.26,
  bevel: 0.075,
}

export function crankArmGeometry() {
  const { length: L, hubR, endR, thickness, bevel } = CRANK
  const s = new THREE.Shape()
  // Upper edge: hub top → end boss top, easing from wide to narrow with a soft waist.
  s.moveTo(0, hubR)
  s.bezierCurveTo(L * 0.3, hubR, L * 0.52, endR * 0.86, L, endR)
  s.absarc(L, 0, endR, Math.PI / 2, -Math.PI / 2, true)
  s.bezierCurveTo(L * 0.52, -endR * 0.86, L * 0.3, -hubR, 0, -hubR)
  s.absarc(0, 0, hubR, -Math.PI / 2, Math.PI / 2, true)

  const g = new THREE.ExtrudeGeometry(s, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.9,
    bevelSegments: 6,
    curveSegments: 48,
  })
  // Shape lies in XY, extruded along +Z. Lay it flat: arm along +X, thickness along +Y.
  g.rotateX(-Math.PI / 2)
  g.translate(0, bevel, 0)
  g.deleteAttribute('normal')
  const smooth = toCreasedNormals(g, THREE.MathUtils.degToRad(40))
  g.dispose()
  // Brushing runs along the arm: map UVs to arm-space so anisotropy follows the length.
  const p = smooth.attributes.position as THREE.BufferAttribute
  const uv = smooth.attributes.uv as THREE.BufferAttribute
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / L, (p.getZ(i) + p.getY(i)) / 2)
  uv.needsUpdate = true
  smooth.computeBoundingSphere()
  return smooth
}

export const crankTopY = () => CRANK.thickness + CRANK.bevel * 2

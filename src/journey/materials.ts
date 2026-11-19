import * as THREE from 'three'

/**
 * Coffee materials.
 *
 * Bean / fragments: one physical material program, per-face attributes decide what a
 * surface is — roasted skin (oily sheen, mottled, silverskin caught in the crease) or a
 * fresh break (pale, matte, porous). Cracks are drawn in the shader along the Voronoi
 * walls the fragments will separate on, growing outward from the blade's contact point.
 *
 * Grounds: an instanced shard whose fall, tumble and landing are computed in the vertex
 * shader from per-instance constants and subject time. No per-frame CPU work.
 */

const NOISE = /* glsl */ `
  float cHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float cNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(cHash(i), cHash(i + vec3(1, 0, 0)), f.x), mix(cHash(i + vec3(0, 1, 0)), cHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(cHash(i + vec3(0, 0, 1)), cHash(i + vec3(1, 0, 1)), f.x), mix(cHash(i + vec3(0, 1, 1)), cHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
  }
`

export const MAX_SEEDS = 6

export interface BeanUniforms {
  uSeeds: { value: THREE.Vector3[] }
  uSeedCount: { value: number }
  uCrack: { value: number }
  uContact: { value: THREE.Vector3 }
}

export function makeBeanMaterial(seeds: THREE.Vector3[] = [], contact = new THREE.Vector3()) {
  const m = new THREE.MeshPhysicalMaterial({
    color: '#4c2e1d',
    roughness: 0.52,
    clearcoat: 0.2,
    clearcoatRoughness: 0.42,
    metalness: 0,
  })
  const list = Array.from({ length: MAX_SEEDS }, (_, i) => seeds[i]?.clone() ?? new THREE.Vector3(99, 99, 99))
  const uniforms: BeanUniforms = {
    uSeeds: { value: list },
    uSeedCount: { value: seeds.length },
    uCrack: { value: 0 },
    uContact: { value: contact.clone() },
  }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aSkin; attribute float aMottle; attribute float aCrease;
        varying float vSkin; varying float vMottle; varying float vCrease; varying vec3 vObj;`,
      )
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkin = aSkin; vMottle = aMottle; vCrease = aCrease; vObj = position;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        ${NOISE}
        varying float vSkin; varying float vMottle; varying float vCrease; varying vec3 vObj;
        uniform vec3 uSeeds[${MAX_SEEDS}];
        uniform int uSeedCount;
        uniform float uCrack;
        uniform vec3 uContact;
        float bCrackLine = 0.0;
        float bPore = 0.0;
        vec3 bPerturb(vec3 surfPos, vec3 n, vec2 dH, float fd) {
          vec3 sx = dFdx(surfPos); vec3 sy = dFdy(surfPos);
          vec3 r1 = cross(sy, n); vec3 r2 = cross(n, sx);
          float det = dot(sx, r1) * fd;
          return normalize(abs(det) * n - sign(det) * (dH.x * r1 + dH.y * r2));
        }`,
      )
      .replace(
        '#include <color_fragment>',
        /* glsl */ `#include <color_fragment>
        vec3 skin = diffuseColor.rgb * (0.74 + 0.5 * vMottle);
        // Silverskin: the papery chaff that stays in the crease.
        skin = mix(skin, vec3(0.3, 0.19, 0.1), smoothstep(0.3, 0.85, vCrease) * 0.8);
        // Inside: a paler, drier roast, open-celled.
        float big = cNoise(vObj * 38.0);
        bPore = smoothstep(0.66, 0.84, cNoise(vObj * 150.0 + 3.1));
        // Linear values: a medium-roast interior is sRGB ≈ #7a5232.
        vec3 inside = vec3(0.17, 0.078, 0.034) * (0.8 + 0.34 * big) * (1.0 - 0.5 * bPore);
        diffuseColor.rgb = mix(inside, skin, vSkin);
        if (uCrack > 0.0) {
          float d1 = 1e3; float d2 = 1e3; vec3 s1 = vec3(0.0); vec3 s2 = vec3(0.0);
          for (int i = 0; i < ${MAX_SEEDS}; i++) {
            if (i >= uSeedCount) break;
            float d = distance(vObj, uSeeds[i]);
            if (d < d1) { d2 = d1; s2 = s1; d1 = d; s1 = uSeeds[i]; }
            else if (d < d2) { d2 = d; s2 = uSeeds[i]; }
          }
          // Distance to the wall between the two nearest cells.
          float wall = (d2 * d2 - d1 * d1) / (2.0 * max(distance(s1, s2), 1e-4));
          float reach = 1.0 - smoothstep(uCrack * 1.25 - 0.1, uCrack * 1.25, distance(vObj, uContact));
          float w = mix(0.0008, 0.0085, uCrack) * reach;
          bCrackLine = (1.0 - smoothstep(w * 0.45, w, wall)) * reach;
          // Edges of a fresh crack lift paler before the gap goes dark.
          float lip = (1.0 - smoothstep(w, w * 2.2, wall)) * reach * 0.5;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.2, 0.095, 0.04), lip * uCrack);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.008, 0.006), bCrackLine);
        }`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `#include <roughnessmap_fragment>
        roughnessFactor = mix(0.88, roughnessFactor * (0.85 + 0.35 * vMottle), vSkin);
        roughnessFactor = mix(roughnessFactor, 1.0, max(bCrackLine, bPore * (1.0 - vSkin)));`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        /* glsl */ `#include <normal_fragment_maps>
        // Broken faces are open-celled: pores and ridges in the normal, not just the colour.
        // Skin gets a faint wrinkle. Both fade before they can alias.
        float bF = 1.0 - smoothstep(0.004, 0.012, length(fwidth(vObj)));
        float bH = mix(bPore * 0.7 + cNoise(vObj * 70.0) * 0.5, cNoise(vObj * 90.0) * 0.25, vSkin) * bF;
        normal = bPerturb(-vViewPosition, normal, vec2(dFdx(bH), dFdy(bH)) * 0.0035, faceDirection);`,
      )
      .replace(
        '#include <lights_physical_fragment>',
        /* glsl */ `#include <lights_physical_fragment>
        material.clearcoat *= vSkin * (1.0 - bCrackLine);`,
      )
  }
  m.customProgramCacheKey = () => 'bean-v3'
  return { material: m, uniforms }
}

/* ------------------------------------------------------------------ */
/* Grounds                                                              */
/* ------------------------------------------------------------------ */

export function makeGroundsMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.86, metalness: 0, flatShading: true })
  const uniforms = { uTau: { value: 0 }, uG: { value: 981 } }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        attribute vec4 aA; // exit position, release τ
        attribute vec4 aB; // landing position, size (cm)
        attribute vec4 aC; // tumble axis, seed
        uniform float uTau;
        uniform float uG;
        varying vec3 vTint;
        vec3 gRot(vec3 v, vec3 k, float a) {
          float c = cos(a); float s = sin(a);
          return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c);
        }
        vec3 gC; vec3 gAxis; float gAng; vec3 gScale;
        void gEval() {
          float dt = uTau - aA.w;
          float h = max(aA.y - aB.y, 0.0);
          float tFall = sqrt(2.0 * h / uG);
          float k = clamp(dt / max(tFall, 1e-5), 0.0, 1.0);
          gC = mix(aA.xyz, aB.xyz, smoothstep(0.0, 1.0, pow(k, 0.8)));
          gC.y = aA.y - h * k * k;
          gAxis = normalize(aC.xyz + 1e-4);
          gAng = clamp(dt, 0.0, tFall) * (14.0 + 30.0 * aC.w) + aC.w * 6.2831;
          float grow = smoothstep(0.0, 0.004, dt);
          gScale = vec3(1.0, 0.8 + 0.28 * fract(aC.w * 7.13), 0.74 + 0.3 * fract(aC.w * 13.7)) * aB.w * grow;
          // Mostly broken interior (medium roast), a few pieces that still carry dark skin.
          float r = fract(aC.w * 31.7);
          vTint = r > 0.84 ? vec3(0.036, 0.016, 0.007) : vec3(0.105, 0.05, 0.023) * (0.72 + 0.56 * fract(aC.w * 3.3));
        }`,
      )
      .replace('#include <beginnormal_vertex>', 'gEval();\nvec3 objectNormal = gRot(normalize(normal / max(gScale, vec3(1e-6))), gAxis, gAng);')
      .replace('#include <begin_vertex>', 'vec3 transformed = gC + gRot(position * gScale, gAxis, gAng);')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTint;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vTint;')
  }
  m.customProgramCacheKey = () => 'grounds-v4'
  return { material: m, uniforms }
}

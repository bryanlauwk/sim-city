import * as THREE from "three";
import type { KitMat } from "./kit";

/** Night glow shared by every building material (0 by day, up to ~0.5 at night). */
export const buildingGlow = { value: 0 };

/** World units per repeat of each surface texture. */
const TEXTURE_SPAN: Partial<Record<KitMat, number>> = {
  brick: 0.32,
  siding: 0.6,
  roof: 0.5,
};

/**
 * Materials for the building kit. Textures are laid out in world space
 * (bricks stay brick-sized however far a part is stretched), windows light
 * up at night, and signs glow. The `upside` variant is the same building in
 * the Upside Down: drained of colour, cold and dark, every light dead.
 */
export function kitMaterial(kind: KitMat, map?: THREE.Texture, upside = false) {
  const m = new THREE.MeshStandardMaterial({
    ...(map ? { map } : {}),
    roughness: kind === "glass" ? 0.22 : kind === "trim" ? 0.7 : kind === "roof" ? 0.95 : 0.88,
    metalness: kind === "glass" ? 0.15 : 0,
  });
  const span = TEXTURE_SPAN[kind] ?? 1;
  const lit = upside ? "0.0" : kind === "glass" ? "0.55" : kind === "brick" ? "0.25" : "0.0";
  const grid = kind === "brick" && !upside;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = buildingGlow;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vKitWorld;\nvarying vec3 vKitNormal;",
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  mat4 kitModel = modelMatrix * instanceMatrix;
#else
  mat4 kitModel = modelMatrix;
#endif
  vKitWorld = (kitModel * vec4(transformed, 1.0)).xyz;
  vKitNormal = normalize(mat3(kitModel) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vKitWorld;
varying vec3 vKitNormal;
uniform float uGlow;
float kitHash(vec3 p){return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453);}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec3 kitN = abs(vKitNormal);
  vec2 kitUv = kitN.y > 0.6 ? vKitWorld.xz : (kitN.x > kitN.z ? vKitWorld.zy : vKitWorld.xy);
  diffuseColor *= texture2D(map, kitUv / ${span.toFixed(3)});
#endif`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  float kitLit = 0.0;
  ${
    grid
      ? `// Upper-floor windows on brick walls, in world space.
  if (abs(vKitNormal.y) < 0.5 && vKitWorld.y > 0.2) {
    vec3 kw = vKitWorld * vec3(7.0, 7.0, 7.0);
    float frameMask = max(step(0.6, fract(kw.y)), step(0.62, fract(kw.x + kw.z)));
    diffuseColor.rgb = mix(vec3(0.12, 0.15, 0.2), diffuseColor.rgb, frameMask);
    kitLit = step(1.0 - ${lit}, kitHash(floor(kw))) * (1.0 - frameMask);
  }`
      : kind === "glass"
        ? `kitLit = step(1.0 - ${lit}, kitHash(floor(vKitWorld * 6.0)));`
        : ""
  }
  ${
    upside
      ? `// The Upside Down: colour drained to a cold blue-grey.
  float kitGrey = dot(diffuseColor.rgb, vec3(0.3, 0.5, 0.2));
  diffuseColor.rgb = mix(vec3(kitGrey), diffuseColor.rgb, 0.12) * vec3(0.42, 0.46, 0.56);`
      : ""
  }`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        kind === "accent" && !upside
          ? "#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * (0.2 + uGlow * 2.0);"
          : "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.76, 0.42) * kitLit * uGlow * 1.3;",
      );
  };
  // Distinct programs for the two worlds and the kinds.
  m.customProgramCacheKey = () => `kit-${kind}-${upside ? 1 : 0}`;
  return m;
}

/** A gable roof: a triangular prism, ridge along x, filling a unit box. */
export function gableGeometry(): THREE.BufferGeometry {
  const shape = new THREE.Shape([
    new THREE.Vector2(-0.5, -0.5),
    new THREE.Vector2(0.5, -0.5),
    new THREE.Vector2(0, 0.5),
  ]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  g.rotateY(Math.PI / 2);
  return g;
}

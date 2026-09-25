import * as THREE from "three";
import type { KitMat } from "./kit";

/** Night glow shared by every building material (0 by day, up to ~0.5 at night). */
export const buildingGlow = { value: 0 };

/**
 * Facade shader: window grids in world space so they stay regular however a
 * part is stretched, and a scattering of lit windows at night.
 */
export function facadeMaterial(kind: KitMat, map?: THREE.Texture, normalMap?: THREE.Texture) {
  const m = new THREE.MeshStandardMaterial({
    // Only the textures this kind has; three.js warns about undefined ones.
    ...(map ? { map } : {}),
    ...(normalMap ? { normalMap, normalScale: new THREE.Vector2(0.18, 0.18) } : {}),
    flatShading: false,
    roughness: kind === "glass" ? 0.25 : 0.85,
    metalness: kind === "glass" ? 0.1 : 0,
  });
  if (kind === "accent") {
    m.emissive = new THREE.Color("#ffffff");
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = buildingGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uGlow;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * (0.15 + uGlow * 1.6);",
        );
    };
    return m;
  }
  const floors = kind === "glass" ? "10.0" : "8.0";
  const cols = kind === "glass" ? "8.0" : "6.0";
  const frame = kind === "glass" ? "0.28" : "0.4";
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uGlow = buildingGlow;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vKitWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vKitWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vKitWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vKitWorld;\nuniform float uGlow;\nfloat kitHash(vec3 p){return fract(sin(dot(p, vec3(12.9898,78.233,37.719)))*43758.5453);}",
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  vec3 kw = vKitWorld * vec3(${cols}, ${floors}, ${cols});
  float floorLine = step(0.78, fract(kw.y));
  float mullion = step(0.84, fract(kw.x + kw.z));
  float frameMask = max(floorLine, mullion);
  diffuseColor.rgb *= 1.0 - ${frame} * frameMask;
  float lit = step(0.8, kitHash(floor(kw))) * (1.0 - frameMask);`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        "#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.78, 0.45) * lit * uGlow * 0.9;",
      );
  };
  return m;
}

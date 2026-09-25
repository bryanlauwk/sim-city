import { useLoader } from "@react-three/fiber";
import * as THREE from "three";

/** Texture props for a material, leaving out the ones that aren't set. */
export function textureProps(map?: THREE.Texture, normalMap?: THREE.Texture, strength = 0.35) {
  return {
    ...(map ? { map } : {}),
    ...(normalMap ? { normalMap, normalScale: new THREE.Vector2(strength, strength) } : {}),
  };
}

/** Every texture an actor can load mid-event, so they can be fetched ahead of time. */
export const ACTOR_TEXTURES = [
  "whale-skin",
  "kaiju-scales",
  "tapir-fur",
  "hornbill-feather",
  "durian-rind",
].flatMap((name) => [`/textures/${name}.webp`, `/textures/${name}.normal.webp`]);

/**
 * Warm the texture cache once the city is on screen. An actor whose texture
 * is still downloading would otherwise suspend mid-event.
 */
export function preloadActorTextures() {
  for (const url of ACTOR_TEXTURES) useLoader.preload(THREE.TextureLoader, url);
}

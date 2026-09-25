import * as THREE from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

const NAME = "KHR_materials_pbrSpecularGlossiness";

interface SpecGloss {
  diffuseFactor?: [number, number, number, number];
  diffuseTexture?: { index: number };
  glossinessFactor?: number;
  specularGlossinessTexture?: { index: number };
}

/**
 * Many older Sketchfab models (and so many Objaverse ones) keep their colours
 * in the retired KHR_materials_pbrSpecularGlossiness extension, which three.js
 * no longer reads, so they load plain white. This converts those materials to
 * standard PBR: the diffuse map becomes the colour map, glossiness becomes
 * roughness, and nothing is metallic.
 */
class SpecGlossPlugin implements GLTFLoaderPlugin {
  readonly name = NAME;
  constructor(private parser: GLTFParser) {}

  private ext(materialIndex: number): SpecGloss | undefined {
    const def = (this.parser.json.materials ?? [])[materialIndex];
    return def?.extensions?.[NAME];
  }

  getMaterialType(materialIndex: number) {
    return this.ext(materialIndex) ? THREE.MeshStandardMaterial : null;
  }

  extendMaterialParams(materialIndex: number, params: Record<string, unknown>) {
    const ext = this.ext(materialIndex);
    if (!ext) return Promise.resolve();
    const [r, g, b, a] = ext.diffuseFactor ?? [1, 1, 1, 1];
    params.color = new THREE.Color().setRGB(r, g, b, THREE.LinearSRGBColorSpace);
    params.opacity = a;
    // A glossiness map can't be inverted per pixel here; use the factor, softened.
    params.roughness = ext.specularGlossinessTexture
      ? 0.55
      : Math.min(1, Math.max(0.15, 1 - (ext.glossinessFactor ?? 0.5)));
    params.metalness = 0;
    const pending: Promise<unknown>[] = [];
    if (ext.diffuseTexture)
      pending.push(
        this.parser.assignTexture(params, "map", ext.diffuseTexture, THREE.SRGBColorSpace),
      );
    return Promise.all(pending);
  }
}

/**
 * Pass to drei's useGLTF (or call on any GLTFLoader, three's or
 * three-stdlib's: both share this plugin API) to read spec-gloss models.
 */
export function withSpecGloss(loader: {
  // The two loaders' plugin types differ only in their GLTF result types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register(callback: (parser: any) => any): unknown;
}) {
  loader.register((parser: GLTFParser) => new SpecGlossPlugin(parser));
}

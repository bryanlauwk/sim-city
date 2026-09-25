import { useEffect, useMemo } from "react";
import { useLoader } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { facadeMaterial } from "./facade";
import { buildRealGeometry, type OsmPiece } from "./osmBuildings";

/**
 * Kuala Lumpur's real buildings (OpenStreetMap footprints and heights) on the
 * tiles that still have them, drawn with the kit's facade shaders: three draw
 * calls for the whole city.
 */
export function RealBuildings({
  grid,
  pieces,
  tiles,
}: {
  grid: Tile[];
  pieces: OsmPiece[];
  tiles: Set<number>;
}) {
  const [glassMap, plasterMap, plasterNormal] = useLoader(THREE.TextureLoader, [
    "/textures/curtain-glass.webp",
    "/textures/heritage-plaster.webp",
    "/textures/heritage-plaster.normal.webp",
  ]);
  const materials = useMemo(() => {
    for (const t of [glassMap, plasterMap, plasterNormal]) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.needsUpdate = true;
    }
    const glass = facadeMaterial("glass", glassMap);
    const masonry = facadeMaterial("solid", plasterMap, plasterNormal);
    for (const m of [glass, masonry]) {
      m.vertexColors = true;
      m.side = THREE.DoubleSide;
    }
    const roofs = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      side: THREE.DoubleSide,
    });
    return { glass, masonry, roofs };
  }, [glassMap, plasterMap, plasterNormal]);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  // Rebuilt only when the set of tiles changes (an event or a redevelopment).
  const key = useMemo(() => [...tiles].sort((a, b) => a - b).join(","), [tiles]);
  const geometry = useMemo(
    () => buildRealGeometry(pieces, tiles, grid),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pieces, key],
  );
  useEffect(() => () => Object.values(geometry).forEach((g) => g.dispose()), [geometry]);

  return (
    <group>
      <mesh geometry={geometry.glass} material={materials.glass} castShadow receiveShadow />
      <mesh geometry={geometry.masonry} material={materials.masonry} castShadow receiveShadow />
      <mesh geometry={geometry.roofs} material={materials.roofs} castShadow receiveShadow />
    </group>
  );
}

import { memo, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TilesAttributionOverlay, TilesPlugin, TilesRenderer } from "3d-tiles-renderer/r3f";
import {
  GLTFExtensionsPlugin,
  GoogleCloudAuthPlugin,
  ReorientationPlugin,
} from "3d-tiles-renderer/plugins";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import type { TilesRenderer as TilesRendererImpl } from "3d-tiles-renderer/three";
import { env } from "./env";
import {
  GOOGLE_LOGO,
  GROUND_HEIGHT_M,
  ORIGIN,
  TILES_URL,
  groundFromHits,
  mapClipPlanes,
  metresPerTile,
  setMapClip,
} from "./tilesPlacement";

/**
 * Google's Photorealistic 3D Tiles of the real Kuala Lumpur, streamed around
 * the game. As a backdrop, everything inside the map square is cut away so
 * the game's own city sits in the real one; in photo mode nothing is cut and
 * the game city is hidden instead.
 *
 * Google's terms require its logo and the data attributions on screen while
 * tiles show, and forbid caching or altering the tiles; both are honoured.
 */
export interface GoogleTilesProps {
  apiKey: string;
  /** Show the whole real city, rather than only what's around the map. */
  photo: boolean;
  /** The key was refused or the tiles can't load, and why. */
  onFail: (reason: string) => void;
  /** The first tiles have arrived. */
  onReady: () => void;
}

/** Google's logo at its standard size, then the data providers' credits. */
function credits(list: { type: string; value: string }[]) {
  const logo = list.find((a) => a.type === "image");
  const text = list
    .filter((a) => a.type === "string" && a.value)
    .map((a) => a.value)
    .join("; ");
  return (
    <>
      {logo && (
        <img
          src={logo.value}
          alt="Google"
          width={66}
          height={26}
          style={{ display: "block", marginLeft: "auto" }}
        />
      )}
      {text && <div>{text}</div>}
    </>
  );
}

/** Where to sample the ground: a grid of rays across and around the map. */
const PROBES = Array.from({ length: 16 }, (_, i) => [
  ((i % 4) - 1.5) * 16,
  (Math.floor(i / 4) - 1.5) * 16,
]);
/** Give up if this many tiles fail before any loads. */
const MAX_EARLY_ERRORS = 6;
/** Google's tile meshes are Draco-compressed; the decoder is served from public/draco. */
const DRACO_PATH = "/draco/";

/** Stop re-measuring the ground after this many good readings. */
const MAX_CALIBRATIONS = 6;

function GoogleTiles({ apiKey, photo, onFail, onReady }: GoogleTilesProps) {
  const gl = useThree((s) => s.gl);
  const tiles = useRef<TilesRendererImpl>(null);
  const holder = useRef<THREE.Group>(null);
  const planes = useMemo(mapClipPlanes, []);
  const materials = useMemo(() => new Set<THREE.MeshBasicMaterial>(), []);
  // One scale for all three axes: the tiles renderer picks its level of
  // detail from distances, which a squashed axis would throw off. (Real
  // heights come out about a quarter taller than the game's own buildings.)
  const scale = useMemo(() => {
    const m = metresPerTile();
    return 2 / (m.x + m.z);
  }, []);
  const failed = useRef(onFail);
  failed.current = onFail;
  const ready = useRef(onReady);
  ready.current = onReady;

  useEffect(() => {
    const was = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = was;
    };
  }, [gl]);

  useEffect(() => setMapClip(planes, !photo), [planes, photo]);

  // Measure the ground under the map and sit it at y = 0, so the real
  // streets line up with the game's whatever the local ellipsoid height is.
  const calibrations = useRef(0);
  const loaded = useRef(false);
  const tileErrors = useRef(0);

  // Everything handed to the tiles renderer stays the same object across
  // renders: new plugin arguments would rebuild the plugin, and with it the
  // Google session (each one billed).
  const handlers = useMemo(() => {
    // The tiles renderer walks its own tile tree for rays; stopping at the
    // first hit keeps this cheap with thousands of photo meshes loaded.
    const raycaster = Object.assign(new THREE.Raycaster(), { firstHitOnly: true });
    const from = new THREE.Vector3();
    const down = new THREE.Vector3(0, -1, 0);
    return {
      // The tiles are photographs with the daylight baked in: draw them
      // unlit, with the clip, and dim them with the game's own time of day.
      onLoadModel: ({ scene }: { scene: THREE.Object3D }) => {
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (!mesh.isMesh) return;
          const old = mesh.material as THREE.MeshStandardMaterial;
          const basic = new THREE.MeshBasicMaterial({
            map: old.map ?? null,
            clippingPlanes: planes,
            clipIntersection: true,
            fog: true,
          });
          old.dispose();
          mesh.material = basic;
          mesh.castShadow = false;
          mesh.receiveShadow = false;
          materials.add(basic);
        });
        loaded.current = true;
        ready.current();
      },
      onDisposeModel: ({ scene }: { scene: THREE.Object3D }) => {
        scene.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.isMesh) materials.delete(mesh.material as THREE.MeshBasicMaterial);
        });
      },
      onLoadError: ({ tile, error }: { tile: unknown; error: Error }) => {
        // The root tileset (or the session behind it) failing means the key
        // or the account isn't set up. A missing tile deeper down is fine,
        // but if tiles keep failing before any has loaded, they never will.
        const reason = error?.message || "unknown error";
        if (tile && (loaded.current || ++tileErrors.current < MAX_EARLY_ERRORS)) return;
        console.warn("Google 3D tiles unavailable:", reason);
        failed.current(reason);
      },
      onTilesLoadEnd: () => {
        const t = tiles.current;
        const g = holder.current;
        if (!t || !g || calibrations.current >= MAX_CALIBRATIONS) return;
        g.updateMatrixWorld(true);
        const hits: number[] = [];
        for (const [x, z] of PROBES) {
          raycaster.set(from.set(x, 60, z), down);
          const hit = raycaster.intersectObject(t.group, true)[0];
          if (hit) hits.push(hit.point.y);
        }
        const ground = groundFromHits(hits);
        if (ground === null) return;
        g.position.y -= ground + 0.02;
        calibrations.current++;
      },
    };
  }, [planes, materials]);
  const authArgs = useMemo(
    () => [{ apiToken: apiKey, autoRefreshToken: true, logoUrl: GOOGLE_LOGO }],
    [apiKey],
  );
  const draco = useMemo(() => new DRACOLoader().setDecoderPath(DRACO_PATH), []);
  useEffect(
    () => () => {
      draco.dispose();
    },
    [draco],
  );
  const gltfArgs = useMemo(() => [{ dracoLoader: draco }], [draco]);
  const placeArgs = useMemo(
    () => [
      {
        lat: THREE.MathUtils.degToRad(ORIGIN.lat),
        lon: THREE.MathUtils.degToRad(ORIGIN.lon),
        height: GROUND_HEIGHT_M,
      },
    ],
    [],
  );

  const tint = useMemo(() => new THREE.Color(), []);
  useFrame(() => {
    const v = 0.22 + env.daylight * 0.78 + env.flash * 0.35;
    tint.setScalar(Math.min(1.2, v));
    for (const m of materials) m.color.copy(tint);
  });

  return (
    <group ref={holder} rotation-y={Math.PI} scale={scale}>
      <TilesRenderer
        ref={tiles}
        url={TILES_URL}
        onLoadModel={handlers.onLoadModel}
        onDisposeModel={handlers.onDisposeModel}
        onLoadError={handlers.onLoadError}
        onTilesLoadEnd={handlers.onTilesLoadEnd}
      >
        <TilesPlugin plugin={GoogleCloudAuthPlugin} args={authArgs} />
        <TilesPlugin plugin={GLTFExtensionsPlugin} args={gltfArgs} />
        <TilesPlugin plugin={ReorientationPlugin} args={placeArgs} />
        <TilesAttributionOverlay
          generateAttributions={credits}
          style={{
            left: "auto",
            right: 0,
            bottom: 96,
            padding: "0 8px",
            maxWidth: 260,
            fontSize: 9,
            lineHeight: 1.3,
            textAlign: "right",
            textShadow: "0 1px 2px rgba(0,0,0,0.7)",
            color: "rgba(255,255,255,0.9)",
            pointerEvents: "none",
          }}
        />
      </TilesRenderer>
    </group>
  );
}

export default memo(GoogleTiles);

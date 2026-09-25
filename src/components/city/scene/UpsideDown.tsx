import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { TownBuildings } from "./Buildings";
import { N, hash, tileX, tileZ } from "./common";
import { GATE } from "./upside";
import { env } from "./env";
import { Ground, Trees } from "./Ground";
import { TileFx } from "./TileFx";

/**
 * The Upside Down: Maple Hollow's dark mirror. The same streets and houses,
 * drained of colour and overgrown with vines, spores drifting up through the
 * cold air, and something enormous standing in the fog over the woods.
 *
 * It hangs upside down under the town (see CityScene's flip). As the rift
 * widens, its vines and spores leak up into the town, starting from the lab.
 */

// ---------------------------------------------------------------------------
// Vines
// ---------------------------------------------------------------------------

const vineTime = { value: 0 };

/** A few tendril shapes, each a tube along a wandering curve within one tile. */
function tendrilGeometries(): THREE.BufferGeometry[] {
  return Array.from({ length: 4 }, (_, v) => {
    const pts: THREE.Vector3[] = [];
    const climb = v >= 2;
    let x = (hash(v, 1) - 0.5) * 0.6;
    let z = (hash(v, 2) - 0.5) * 0.6;
    for (let k = 0; k < 7; k++) {
      pts.push(new THREE.Vector3(x, climb ? k * 0.06 : 0.012 + hash(v, k + 30) * 0.02, z));
      x += (hash(v, k + 10) - 0.5) * 0.3;
      z += (hash(v, k + 20) - 0.5) * 0.3;
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    return new THREE.TubeGeometry(curve, 24, climb ? 0.014 : 0.018, 5, false);
  });
}

function vineMaterial() {
  const m = new THREE.MeshStandardMaterial({
    color: "#3b1f22",
    roughness: 0.7,
    emissive: "#6a0f16",
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = vineTime;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vVineWorld;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vVineWorld = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vVineWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec3 vVineWorld;\nuniform float uTime;",
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
  // A slow pulse runs along the vines, like something breathing.
  float pulse = 0.5 + 0.5 * sin(uTime * 1.3 - length(vVineWorld.xz) * 0.8);
  totalEmissiveRadiance *= 0.15 + pulse * 0.6;`,
      );
  };
  return m;
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpS = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Vines over the given tiles: a few tendrils each, turned and sized at random. */
export function Vines({ tiles, perTile = 3 }: { tiles: number[]; perTile?: number }) {
  const geos = useMemo(tendrilGeometries, []);
  const mat = useMemo(vineMaterial, []);
  const refs = useRef<(THREE.InstancedMesh | null)[]>([]);
  const cap = Math.max(1, Math.ceil((tiles.length * perTile) / geos.length) + 4);

  useLayoutEffect(() => {
    const counts = geos.map(() => 0);
    tiles.forEach((t) => {
      for (let k = 0; k < perTile; k++) {
        const v = Math.floor(hash(t, 900 + k) * geos.length);
        const mesh = refs.current[v];
        if (!mesh || counts[v] >= cap) continue;
        tmpQ.setFromAxisAngle(UP, hash(t, 910 + k) * Math.PI * 2);
        tmpP.set(
          tileX(t) + (hash(t, 920 + k) - 0.5) * 0.3,
          0,
          tileZ(t) + (hash(t, 930 + k) - 0.5) * 0.3,
        );
        tmpS.setScalar(0.8 + hash(t, 940 + k) * 0.8);
        tmpM.compose(tmpP, tmpQ, tmpS);
        mesh.setMatrixAt(counts[v]++, tmpM);
      }
    });
    refs.current.forEach((mesh, v) => {
      if (!mesh) return;
      mesh.count = counts[v];
      mesh.instanceMatrix.needsUpdate = true;
    });
  }, [tiles, perTile, geos, cap]);

  useFrame(({ clock }) => {
    vineTime.value = clock.elapsedTime;
  });

  return (
    <group>
      {geos.map((g, v) => (
        <instancedMesh
          key={`${v}-${cap}`}
          ref={(r) => {
            refs.current[v] = r;
          }}
          args={[g, mat, cap]}
          frustumCulled={false}
        />
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Spores
// ---------------------------------------------------------------------------

const SPORE_VERTEX = /* glsl */ `
attribute vec4 aSeed;
uniform float uTime;
uniform float uHeight;
uniform float uSize;
varying float vAlpha;
void main() {
  vec3 p = position;
  float life = fract(aSeed.x + uTime * (0.015 + aSeed.y * 0.02));
  p.y = life * uHeight;
  p.x += sin(uTime * 0.4 + aSeed.z * 6.28) * 0.6;
  p.z += cos(uTime * 0.3 + aSeed.w * 6.28) * 0.6;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + aSeed.w) * (60.0 / max(1.0, -mv.z));
  vAlpha = smoothstep(0.0, 0.1, life) * (1.0 - smoothstep(0.8, 1.0, life));
}`;

const SPORE_FRAGMENT = /* glsl */ `
uniform vec3 uColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.1, length(c)) * vAlpha * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uColor, a);
}`;

/** Ash-like spores drifting upward over an area. */
export function Spores({
  count,
  half = 18,
  height = 9,
  radius,
  color = "#c9ced8",
}: {
  count: number;
  half?: number;
  height?: number;
  /** Keep them within this distance of the centre (default: the whole square). */
  radius?: number;
  color?: string;
}) {
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      let x = (hash(i, 1) - 0.5) * 2 * half;
      let z = (hash(i, 2) - 0.5) * 2 * half;
      if (radius !== undefined) {
        const a = hash(i, 3) * Math.PI * 2;
        const r = Math.sqrt(hash(i, 4)) * radius;
        x = Math.cos(a) * r;
        z = Math.sin(a) * r;
      }
      pos[i * 3] = x;
      pos[i * 3 + 2] = z;
      for (let k = 0; k < 4; k++) seeds[i * 4 + k] = hash(i, 10 + k);
    }
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
    return g;
  }, [count, half, radius]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SPORE_VERTEX,
        fragmentShader: SPORE_FRAGMENT,
        uniforms: {
          uTime: { value: 0 },
          uHeight: { value: height },
          uSize: { value: 1.4 },
          uColor: { value: new THREE.Color(color) },
        },
        transparent: true,
        depthWrite: false,
      }),
    [height, color],
  );
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );
  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime;
  });
  if (!count) return null;
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

// ---------------------------------------------------------------------------
// The thing in the fog
// ---------------------------------------------------------------------------

/**
 * A colossal shape standing over Blackpine Woods: a churning dark mass on
 * long, jointed legs. Seen only in the Upside Down, lit by the red lightning.
 */
export function Looming({
  position = [-12, 0, -52],
  getRise,
}: {
  position?: [number, number, number];
  /** 0 (below the horizon) to 1 (standing tall); fixed at 1 if not given. */
  getRise?: () => number;
}) {
  const group = useRef<THREE.Group>(null);
  const legs = useRef<THREE.Group>(null);
  const bodyMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#07080b", roughness: 1, fog: false }),
    [],
  );
  const legGeo = useMemo(() => new THREE.CylinderGeometry(0.05, 0.4, 1, 6), []);
  const LEGS = 7;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (group.current) {
      const rise = getRise ? getRise() : 1;
      group.current.position.set(
        position[0] + Math.sin(t * 0.05) * 3,
        position[1] - (1 - rise) * 24,
        position[2],
      );
      group.current.rotation.y = Math.sin(t * 0.03) * 0.2;
    }
    legs.current?.children.forEach((leg, k) => {
      leg.rotation.z = Math.sin(t * 0.2 + k * 1.7) * 0.08 + (k - LEGS / 2) * 0.12;
    });
    // Its outline shows when the lightning flashes.
    bodyMat.emissive.setRGB(env.flash * 0.12, 0.01 * env.flash, 0.01 * env.flash);
  });
  return (
    <group ref={group} position={position} scale={0.7}>
      {/* The body: a churning mass of dark lobes */}
      {Array.from({ length: 9 }, (_, k) => (
        <mesh
          key={k}
          material={bodyMat}
          position={[(hash(k, 1) - 0.5) * 9, 13 + (hash(k, 2) - 0.5) * 3, (hash(k, 3) - 0.5) * 5]}
          scale={[3 + hash(k, 4) * 3, 2 + hash(k, 5) * 2, 3 + hash(k, 6) * 2]}
        >
          <icosahedronGeometry args={[1, 2]} />
        </mesh>
      ))}
      <group ref={legs}>
        {Array.from({ length: LEGS }, (_, k) => {
          const a = (k / LEGS) * Math.PI * 2;
          return (
            <group key={k} position={[Math.cos(a) * 3, 13, Math.sin(a) * 2]}>
              <mesh
                material={bodyMat}
                geometry={legGeo}
                position={[Math.cos(a) * 3, -6.5, Math.sin(a) * 2.5]}
                rotation={[Math.sin(a) * 0.3, 0, -Math.cos(a) * 0.3]}
                scale={[1, 14, 1]}
              />
            </group>
          );
        })}
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// The two worlds
// ---------------------------------------------------------------------------

/** The Upside Down's copy of the town. Rendered only while someone is looking. */
export function UpsideDownWorld({ grid }: { grid: Tile[] }) {
  // Vines everywhere except open water.
  const vineTiles = useMemo(
    () => grid.map((_, i) => i).filter((i) => grid[i].kind !== "water" && hash(i, 950) < 0.8),
    [grid],
  );
  return (
    <group>
      <Ground grid={grid} upside />
      <Trees grid={grid} upside />
      <TownBuildings grid={grid} upside />
      <TileFx grid={grid} upside />
      <Vines tiles={vineTiles} perTile={3} />
      <Spores count={1600} half={17} height={10} />
      {/* The gate under the lab, glowing */}
      <pointLight position={[GATE.x, 1.2, GATE.z]} color="#ff2a2a" intensity={8} distance={9} />
      <Looming />
    </group>
  );
}

/**
 * The Upside Down leaking into the town as the rift widens: vines spreading
 * out from the lab, spores rising, a red glow at the gate.
 */
export function RiftLeak({ grid, rift }: { grid: Tile[]; rift: number }) {
  // Past 25 the vines start from the gate; at 100 they reach across town.
  const reach = rift < 25 ? 0 : ((rift - 25) / 75) * 30;
  const band = Math.round(reach * 2) / 2;
  const tiles = useMemo(() => {
    if (!band) return [];
    return grid
      .map((_, i) => i)
      .filter((i) => {
        if (grid[i].kind === "water") return false;
        const d = Math.hypot(tileX(i) - GATE.x, tileZ(i) - GATE.z);
        // Ragged edges: tiles near the limit only sometimes.
        return d < band * (0.7 + hash(i, 960) * 0.3);
      });
  }, [grid, band]);
  const glow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    if (glow.current)
      glow.current.intensity =
        rift < 15 ? 0 : (rift / 100) * 10 * (0.8 + Math.sin(clock.elapsedTime * 2) * 0.2);
  });
  const spores = rift < 20 ? 0 : Math.round(rift * 10);
  return (
    <group>
      {tiles.length > 0 && <Vines tiles={tiles} perTile={2} />}
      <Spores count={spores} half={N / 2} height={6} />
      <pointLight
        ref={glow}
        position={[GATE.x, 0.6, GATE.z]}
        color="#ff3322"
        intensity={0}
        distance={8}
      />
    </group>
  );
}

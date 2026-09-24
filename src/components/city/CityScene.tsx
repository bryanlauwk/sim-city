import { Suspense, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { GRID_SIZE, type CityState, type Landmark, type Tile } from "@/lib/city/types";

const CENTER = (GRID_SIZE - 1) / 2;
const letters = "abcdefgh";

const MODELS = {
  house: Array.from({ length: 8 }, (_, i) => `/models/suburban/building-type-${letters[i]}.glb`),
  shop: Array.from({ length: 8 }, (_, i) => `/models/commercial/building-${letters[i]}.glb`),
  tower: Array.from(
    { length: 5 },
    (_, i) => `/models/commercial/building-skyscraper-${letters[i]}.glb`,
  ),
  park: ["/models/suburban/tree-large.glb", "/models/suburban/tree-small.glb"],
};
Object.values(MODELS)
  .flat()
  .forEach((url) => useGLTF.preload(url));

const BASE_COLOR: Record<string, string> = {
  empty: "#9cc98a",
  road: "#55575e",
  house: "#b9d7a4",
  shop: "#c9c6bd",
  tower: "#bdbab2",
  park: "#6fbf5f",
  rubble: "#8a7f72",
  water: "#4aa3df",
  landmark: "#d9d2c0",
};

// ---------------------------------------------------------------------------
// Kenney models, scaled so every building fits its tile.
// ---------------------------------------------------------------------------

const FOOTPRINT: Record<string, number> = { house: 0.82, shop: 0.86, tower: 0.8, park: 0.55 };

function KenneyModel({ url, kind }: { url: string; kind: string }) {
  const { scene } = useGLTF(url);
  const { object, scale, offset } = useMemo(() => {
    const object = scene.clone(true);
    object.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const scale = FOOTPRINT[kind] / Math.max(size.x, size.z, 0.001);
    const center = box.getCenter(new THREE.Vector3());
    return { object, scale, offset: new THREE.Vector3(-center.x, -box.min.y, -center.z) };
  }, [scene, kind]);

  return (
    <group scale={scale}>
      <primitive object={object} position={offset} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Procedural bits: landmarks, fire, rubble, flood.
// ---------------------------------------------------------------------------

function LandmarkMesh({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const mat = <meshStandardMaterial color={lm.color} flatShading roughness={0.7} />;
  switch (lm.shape) {
    case "tower":
      return (
        <mesh castShadow position={[0, h / 2, 0]}>
          <cylinderGeometry args={[0.3, 0.38, h, 8]} />
          {mat}
        </mesh>
      );
    case "dome":
      return (
        <mesh castShadow scale={[1, h / 0.45, 1]}>
          <sphereGeometry args={[0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
          {mat}
        </mesh>
      );
    case "pyramid":
      return (
        <mesh castShadow position={[0, h / 2, 0]} rotation={[0, Math.PI / 4, 0]}>
          <coneGeometry args={[0.6, h, 4]} />
          {mat}
        </mesh>
      );
    case "spire":
      return (
        <mesh castShadow position={[0, h / 2, 0]}>
          <coneGeometry args={[0.22, h, 6]} />
          {mat}
        </mesh>
      );
    case "blob":
      return (
        <mesh castShadow position={[0, h / 2, 0]} scale={[1, h / 0.8, 1]}>
          <icosahedronGeometry args={[0.4, 1]} />
          {mat}
        </mesh>
      );
    case "arch":
      return (
        <mesh castShadow rotation={[0, Math.PI / 4, 0]} scale={[1, h / 0.4, 1]}>
          <torusGeometry args={[0.35, 0.08, 6, 12, Math.PI]} />
          {mat}
        </mesh>
      );
    case "crater":
      return (
        <group>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.45, 10]} />
            <meshStandardMaterial color="#2b241f" flatShading />
          </mesh>
          <mesh
            position={[0, 0.03, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[1, 1, Math.max(0.3, h)]}
          >
            <torusGeometry args={[0.46, 0.07, 4, 10]} />
            {mat}
          </mesh>
        </group>
      );
    case "statue":
    default:
      return (
        <group>
          <mesh castShadow position={[0, 0.1, 0]}>
            <boxGeometry args={[0.5, 0.2, 0.5]} />
            <meshStandardMaterial color="#b8b2a6" flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.2 + h * 0.4, 0]}>
            <capsuleGeometry args={[0.12, h * 0.6, 3, 6]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.2 + h * 0.85, 0]}>
            <sphereGeometry args={[0.13, 8, 6]} />
            {mat}
          </mesh>
        </group>
      );
  }
}

function Fire({ seed, y }: { seed: number; y: number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const g = ref.current;
    if (!g) return;
    g.children.forEach((c, i) => {
      const t = clock.elapsedTime * 6 + i * 1.7 + seed;
      c.scale.y = 0.8 + Math.sin(t) * 0.25;
    });
  });
  return (
    <group ref={ref} position={[0, y, 0]} scale={1.4}>
      {[
        [0, 0, 0, 0.5],
        [0.2, 0, 0.12, 0.35],
        [-0.18, 0, -0.1, 0.4],
      ].map(([x, y, z, h], i) => (
        <mesh key={i} position={[x, y + h, z]}>
          <coneGeometry args={[0.13, h * 2, 5]} />
          <meshStandardMaterial
            color={i === 0 ? "#ff7a1a" : "#ffc233"}
            emissive="#ff5500"
            emissiveIntensity={1.4}
            flatShading
          />
        </mesh>
      ))}
      <mesh position={[0, 1.35, 0]}>
        <icosahedronGeometry args={[0.28, 0]} />
        <meshStandardMaterial color="#3a3633" transparent opacity={0.55} flatShading />
      </mesh>
    </group>
  );
}

function Rubble({ seed }: { seed: number }) {
  const bits = useMemo(() => {
    let r = seed * 9301 + 49297;
    const rnd = () => (r = (r * 9301 + 49297) % 233280) / 233280;
    return Array.from({ length: 5 }, () => ({
      p: [rnd() * 0.6 - 0.3, 0.06, rnd() * 0.6 - 0.3] as [number, number, number],
      s: 0.08 + rnd() * 0.14,
      r: rnd() * Math.PI,
    }));
  }, [seed]);
  return (
    <group>
      {bits.map((b, i) => (
        <mesh key={i} position={b.p} rotation={[b.r, b.r, 0]} castShadow>
          <boxGeometry args={[b.s, b.s, b.s]} />
          <meshStandardMaterial color={i % 2 ? "#6e655b" : "#9a9084"} flatShading />
        </mesh>
      ))}
    </group>
  );
}

/** Rough roof heights so flames sit on top of the building rather than inside it. */
function roofHeight(tile: Tile): number {
  if (tile.kind === "landmark") return (tile.landmark?.height ?? 1) * 0.8;
  return { house: 0.45, shop: 0.8, tower: 1.6, park: 0.3 }[tile.kind as string] ?? 0.1;
}

/** Scales a freshly built thing up from nothing. */
function PopIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (g && g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 3));
  });
  return (
    <group ref={ref} scale={0.01}>
      {children}
    </group>
  );
}

function TileView({ tile, i }: { tile: Tile; i: number }) {
  const x = (i % GRID_SIZE) - CENTER;
  const z = Math.floor(i / GRID_SIZE) - CENTER;
  const isWater = tile.kind === "water";
  const models = MODELS[tile.kind as keyof typeof MODELS];

  return (
    <group position={[x, 0, z]}>
      <mesh receiveShadow position={[0, isWater ? -0.08 : -0.05, 0]}>
        <boxGeometry args={[0.98, 0.1, 0.98]} />
        <meshStandardMaterial
          color={BASE_COLOR[tile.kind]}
          flatShading
          roughness={isWater ? 0.2 : 0.9}
        />
      </mesh>
      {models && (
        <PopIn key={`${tile.kind}-${tile.builtDay}`}>
          <Suspense fallback={null}>
            <KenneyModel url={models[tile.variant % models.length]} kind={tile.kind} />
          </Suspense>
        </PopIn>
      )}
      {tile.kind === "landmark" && tile.landmark && (
        <PopIn key={`lm-${tile.builtDay}`}>
          <LandmarkMesh lm={tile.landmark} />
        </PopIn>
      )}
      {tile.kind === "rubble" && <Rubble seed={i + tile.builtDay} />}
      {tile.fire > 0 && <Fire seed={i} y={roofHeight(tile)} />}
      {tile.flood > 0 && (
        <mesh position={[0, 0.12, 0]}>
          <boxGeometry args={[1, 0.16, 1]} />
          <meshStandardMaterial color="#3b8fd6" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Camera shake + sky mood
// ---------------------------------------------------------------------------

/** Shakes everything inside it for a moment whenever `trigger` changes. */
function Shaker({
  trigger,
  strength,
  children,
}: {
  trigger: number;
  strength: number;
  children: React.ReactNode;
}) {
  const ref = useRef<THREE.Group>(null);
  const amount = useRef(0);
  useEffect(() => {
    if (trigger) amount.current = strength;
  }, [trigger, strength]);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    if (amount.current <= 0.002) {
      g.position.set(0, 0, 0);
      return;
    }
    g.position.set(
      (Math.random() - 0.5) * amount.current,
      (Math.random() - 0.5) * amount.current * 0.5,
      (Math.random() - 0.5) * amount.current,
    );
    amount.current *= Math.pow(0.03, dt);
  });
  return <group ref={ref}>{children}</group>;
}

function Sky({ chaos }: { chaos: number }) {
  const { scene } = useThree();
  const target = useMemo(
    () => new THREE.Color("#cfe4ef").lerp(new THREE.Color("#e9a07f"), Math.min(1, chaos / 70)),
    [chaos],
  );
  useFrame(() => {
    if (!(scene.background instanceof THREE.Color)) scene.background = target.clone();
    (scene.background as THREE.Color).lerp(target, 0.03);
    if (scene.fog) scene.fog.color.copy(scene.background as THREE.Color);
  });
  return <fog attach="fog" args={["#cfe4ef", 30, 60]} />;
}

export interface CitySceneProps {
  city: CityState;
  shake: { trigger: number; strength: number };
}

export default function CityScene({ city, shake }: CitySceneProps) {
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  return (
    <Canvas
      shadows={small ? false : "percentage"}
      dpr={[1, small ? 1.5 : 2]}
      camera={{ position: [13, 13, 13], fov: 38 }}
      gl={{ antialias: true }}
    >
      <Sky chaos={city.stats.chaos} />
      <hemisphereLight args={["#fff8e7", "#6b7f5a", 0.9]} />
      <directionalLight
        castShadow
        position={[10, 18, 6]}
        intensity={1.8}
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.11, 0]}>
        <planeGeometry args={[120, 120]} />
        <meshStandardMaterial color="#86b07a" />
      </mesh>
      <Shaker trigger={shake.trigger} strength={shake.strength}>
        {city.grid.map((tile, i) => (
          <TileView key={i} tile={tile} i={i} />
        ))}
      </Shaker>
      <OrbitControls
        makeDefault
        enablePan={false}
        minDistance={9}
        maxDistance={38}
        maxPolarAngle={1.25}
        minPolarAngle={0.35}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}

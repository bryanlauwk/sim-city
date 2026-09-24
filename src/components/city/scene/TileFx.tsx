import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";
import type { Landmark, Tile } from "@/lib/city/types";
import { tileX, tileZ } from "./common";

function Mat({ color, metal = 0 }: { color: string; metal?: number }) {
  // No environment map in the scene, so keep metalness low or surfaces go black.
  return (
    <meshStandardMaterial color={color} flatShading roughness={0.45} metalness={metal * 0.25} />
  );
}

function TwinTower({ x, h, color }: { x: number; h: number; color: string }) {
  const tiers = 6;
  return (
    <group position={[x, 0, 0]}>
      {Array.from({ length: tiers }, (_, k) => {
        const segH = (h * 0.82) / tiers;
        const r = 0.17 - k * 0.018;
        return (
          <mesh key={k} castShadow position={[0, segH * (k + 0.5), 0]}>
            <cylinderGeometry args={[r * 0.97, r, segH, 8]} />
            <Mat color={color} metal={0.55} />
          </mesh>
        );
      })}
      <mesh castShadow position={[0, h * 0.91, 0]}>
        <coneGeometry args={[0.05, h * 0.18, 6]} />
        <Mat color={color} metal={0.6} />
      </mesh>
    </group>
  );
}

export function LandmarkMesh({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const mat = <Mat color={lm.color} />;
  switch (lm.shape) {
    case "twin_towers":
      return (
        <group>
          <TwinTower x={-0.2} h={h * 1.25} color={lm.color} />
          <TwinTower x={0.2} h={h * 1.25} color={lm.color} />
          <mesh castShadow position={[0, h * 0.5, 0]}>
            <boxGeometry args={[0.3, 0.05, 0.08]} />
            <Mat color="#9aa3ad" metal={0.4} />
          </mesh>
        </group>
      );
    case "needle":
      return (
        <group>
          <mesh castShadow position={[0, h * 0.37, 0]}>
            <cylinderGeometry args={[0.05, 0.09, h * 0.74, 8]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, h * 0.77, 0]} scale={[1, 0.8, 1]}>
            <sphereGeometry args={[0.3, 12, 8]} />
            <Mat color="#8fb9c9" metal={0.3} />
          </mesh>
          <mesh castShadow position={[0, h * 0.92, 0]}>
            <cylinderGeometry args={[0.01, 0.02, h * 0.22, 4]} />
            {mat}
          </mesh>
        </group>
      );
    case "supertall":
      return (
        <group>
          <mesh castShadow position={[0, h * 0.42, 0]}>
            <cylinderGeometry args={[0.1, 0.32, h * 0.84, 6]} />
            <Mat color={lm.color} metal={0.5} />
          </mesh>
          <mesh castShadow position={[0, h * 0.92, 0]}>
            <coneGeometry args={[0.05, h * 0.18, 6]} />
            {mat}
          </mesh>
        </group>
      );
    case "mosque":
      return (
        <group scale={Math.max(0.7, h)}>
          <mesh castShadow position={[0, 0.12, 0]}>
            <boxGeometry args={[0.6, 0.24, 0.6]} />
            <Mat color="#f1ece2" />
          </mesh>
          <mesh castShadow position={[0, 0.24, 0]}>
            <sphereGeometry args={[0.22, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            {mat}
          </mesh>
          {[-0.36, 0.36].map((x) => (
            <group key={x} position={[x, 0, 0.36]}>
              <mesh castShadow position={[0, 0.3, 0]}>
                <cylinderGeometry args={[0.035, 0.04, 0.6, 6]} />
                <Mat color="#f1ece2" />
              </mesh>
              <mesh castShadow position={[0, 0.65, 0]}>
                <coneGeometry args={[0.05, 0.1, 6]} />
                {mat}
              </mesh>
            </group>
          ))}
        </group>
      );
    case "colonial":
      return (
        <group scale={Math.max(0.8, h)}>
          <mesh castShadow position={[0, 0.14, 0]}>
            <boxGeometry args={[0.9, 0.28, 0.38]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.42, 0]}>
            <boxGeometry args={[0.16, 0.34, 0.16]} />
            {mat}
          </mesh>
          {[
            [0, 0.62],
            [-0.36, 0.32],
            [0.36, 0.32],
          ].map(([x, y]) => (
            <mesh key={x} castShadow position={[x, y, 0]}>
              <sphereGeometry args={[0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
              <Mat color="#4c8a78" metal={0.3} />
            </mesh>
          ))}
        </group>
      );
    case "crown_tower": {
      // The Exchange 106: a square glass shaft that narrows in steps to a crown.
      const tiers = [0.34, 0.31, 0.28, 0.25, 0.21];
      const seg = (h * 0.85) / tiers.length;
      return (
        <group>
          {tiers.map((w, k) => (
            <mesh key={k} castShadow position={[0, seg * (k + 0.5), 0]}>
              <boxGeometry args={[w * 2, seg, w * 2]} />
              <Mat color={lm.color} metal={0.4} />
            </mesh>
          ))}
          <mesh castShadow position={[0, h * 0.92, 0]} rotation={[0, Math.PI / 4, 0]}>
            <coneGeometry args={[0.3, h * 0.16, 4, 1, true]} />
            <Mat color="#dfe6ec" />
          </mesh>
        </group>
      );
    }
    case "mall":
      return (
        <group>
          <mesh castShadow position={[0, 0.22, 0]}>
            <boxGeometry args={[0.92, 0.44, 0.9]} />
            <Mat color={lm.color} />
          </mesh>
          {/* Curved glass entrance facing the street */}
          <mesh castShadow position={[0, 0.2, 0.3]} rotation={[0, 0, 0]}>
            <cylinderGeometry args={[0.32, 0.32, 0.4, 12, 1, false, -Math.PI / 2, Math.PI]} />
            <meshStandardMaterial color="#9cc3d8" roughness={0.2} transparent opacity={0.85} />
          </mesh>
          {h > 1 && (
            <mesh castShadow position={[0.15, 0.44 + (h - 0.4) / 2, -0.2]}>
              <boxGeometry args={[0.45, h - 0.4, 0.4]} />
              <Mat color={lm.color} />
            </mesh>
          )}
        </group>
      );
    case "green_facade":
      return (
        <group>
          <mesh castShadow position={[0, h / 2, 0]}>
            <boxGeometry args={[0.86, h, 0.86]} />
            <Mat color={lm.color} />
          </mesh>
          {[0.25, 0.5, 0.75].map((f) => (
            <mesh key={f} position={[0, h * f, 0]}>
              <boxGeometry args={[0.88, 0.03, 0.88]} />
              <Mat color="#f2f2ea" />
            </mesh>
          ))}
        </group>
      );
    case "twin_block":
      return (
        <group>
          <mesh castShadow position={[0, 0.2, 0]}>
            <boxGeometry args={[0.95, 0.4, 0.9]} />
            <Mat color={lm.color} />
          </mesh>
          {[-0.24, 0.24].map((x) => (
            <mesh key={x} castShadow position={[x, 0.4 + (h - 0.4) / 2, 0]}>
              <boxGeometry args={[0.36, h - 0.4, 0.5]} />
              <Mat color={lm.color} />
            </mesh>
          ))}
          <mesh position={[0, h * 0.8, 0.26]}>
            <boxGeometry args={[0.5, 0.12, 0.02]} />
            <Mat color="#c22e2e" />
          </mesh>
        </group>
      );
    case "art_deco":
      return (
        <group>
          <mesh castShadow position={[0, 0.16, 0]}>
            <boxGeometry args={[0.95, 0.32, 0.6]} />
            <Mat color={lm.color} />
          </mesh>
          <mesh castShadow position={[0, 0.3, 0.05]}>
            <boxGeometry args={[0.36, 0.6 * h, 0.5]} />
            <Mat color="#f1f4f6" />
          </mesh>
          <mesh position={[0, 0.34, 0.31]}>
            <boxGeometry args={[0.2, 0.2, 0.02]} />
            <Mat color={lm.color} />
          </mesh>
        </group>
      );
    case "hawker":
      // Stalls under canopies, strung with red lanterns.
      return (
        <group>
          {[-0.3, 0, 0.3].map((z, k) => (
            <group key={z} position={[k % 2 ? 0.18 : -0.18, 0, z]}>
              <mesh castShadow position={[0, 0.1, 0]}>
                <boxGeometry args={[0.28, 0.12, 0.2]} />
                <Mat color="#dcd6c8" />
              </mesh>
              <mesh castShadow position={[0, 0.25, 0]}>
                <boxGeometry args={[0.34, 0.03, 0.26]} />
                <Mat color={lm.color} />
              </mesh>
            </group>
          ))}
          {[-0.36, -0.12, 0.12, 0.36].map((z) => (
            <mesh key={z} position={[0, 0.34, z]}>
              <sphereGeometry args={[0.04, 8, 6]} />
              <meshStandardMaterial color="#e0322b" emissive="#ff3b2b" emissiveIntensity={0.8} />
            </mesh>
          ))}
        </group>
      );
    case "shophouses":
      return (
        <group>
          {["#e8b04a", "#7cc3b1", "#e98f8f", "#9db8e0"].map((c, k) => (
            <group key={c} position={[-0.33 + k * 0.22, 0, 0]}>
              <mesh castShadow position={[0, 0.22 * h * 2, 0]}>
                <boxGeometry args={[0.2, 0.44 * h * 2, 0.7]} />
                <Mat color={c} />
              </mesh>
              <mesh castShadow position={[0, 0.46 * h * 2, 0]}>
                <boxGeometry args={[0.22, 0.05, 0.74]} />
                <Mat color="#b5532f" />
              </mesh>
            </group>
          ))}
        </group>
      );
    case "stadium":
      return (
        <group>
          <mesh position={[0, 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 0.7, 1]}>
            <circleGeometry args={[0.36, 20]} />
            <Mat color="#5fa84f" />
          </mesh>
          <mesh
            castShadow
            position={[0, 0.1, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            scale={[1, 0.7, 1]}
          >
            <torusGeometry args={[0.4, 0.08, 6, 24]} />
            <Mat color={lm.color} />
          </mesh>
        </group>
      );
    case "convention":
      return (
        <group>
          <mesh castShadow position={[0, 0.15, 0]}>
            <boxGeometry args={[0.95, 0.3, 0.7]} />
            <Mat color={lm.color} />
          </mesh>
          <mesh castShadow position={[0, 0.3, 0]} rotation={[0, 0, Math.PI / 2]}>
            <cylinderGeometry args={[0.3, 0.3, 0.95, 12, 1, false, 0, Math.PI]} />
            <Mat color="#8fa4b4" />
          </mesh>
        </group>
      );
    case "flagpole":
      return (
        <group>
          <mesh castShadow position={[0, h / 2, 0]}>
            <cylinderGeometry args={[0.015, 0.02, h, 6]} />
            <Mat color="#f2f2f2" />
          </mesh>
          {/* Jalur Gemilang */}
          <mesh position={[0.17, h - 0.1, 0]}>
            <boxGeometry args={[0.32, 0.18, 0.01]} />
            <meshStandardMaterial color="#cc0001" />
          </mesh>
          <mesh position={[0.08, h - 0.06, 0.006]}>
            <boxGeometry args={[0.14, 0.1, 0.01]} />
            <meshStandardMaterial color="#010066" />
          </mesh>
          <mesh position={[0.08, h - 0.06, 0.012]}>
            <circleGeometry args={[0.03, 10]} />
            <meshStandardMaterial color="#ffcc00" />
          </mesh>
        </group>
      );
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
            <Mat color="#b8b2a6" />
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
      if (i < 3) c.scale.y = 0.8 + Math.sin(t) * 0.25;
      else {
        // Smoke drifts up and resets.
        const k = (clock.elapsedTime * 0.5 + seed * 0.13 + i * 0.3) % 1;
        c.position.y = 0.9 + k * 1.6;
        c.scale.setScalar(0.6 + k * 1.2);
        ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).opacity = 0.55 * (1 - k);
      }
    });
  });
  return (
    <group ref={ref} position={[0, y, 0]} scale={1.3}>
      {[
        [0, 0, 0, 0.5],
        [0.2, 0, 0.12, 0.35],
        [-0.18, 0, -0.1, 0.4],
      ].map(([x, yy, z, h], i) => (
        <mesh key={i} position={[x, yy + h, z]}>
          <coneGeometry args={[0.13, h * 2, 5]} />
          <meshStandardMaterial
            color={i === 0 ? "#ff7a1a" : "#ffc233"}
            emissive="#ff5500"
            emissiveIntensity={1.6}
            flatShading
          />
        </mesh>
      ))}
      {[0, 1].map((k) => (
        <mesh key={`s${k}`} position={[0, 1, 0]}>
          <icosahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial color="#3a3633" transparent opacity={0.5} flatShading />
        </mesh>
      ))}
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

function roofHeight(tile: Tile): number {
  if (tile.kind === "landmark") return Math.min(2, (tile.landmark?.height ?? 1) * 0.6);
  return { house: 0.45, shop: 0.8, tower: 2, park: 0.3, forest: 0.35 }[tile.kind as string] ?? 0.1;
}

function PopIn({ children }: { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const g = ref.current;
    if (g && g.scale.x < 1) g.scale.setScalar(Math.min(1, g.scale.x + dt * 2.5));
  });
  return (
    <group ref={ref} scale={0.01}>
      {children}
    </group>
  );
}

/** Landmarks, fires, rubble and floods — the few tiles that need their own meshes. */
const LABEL_HEIGHT: Partial<Record<Landmark["shape"], number>> = {
  twin_towers: 1.25,
  needle: 1,
  supertall: 1,
  crown_tower: 1,
};

/** Name tags over the landmarks, one per name. */
export function LandmarkLabels({ grid }: { grid: Tile[] }) {
  const labels = useMemo(() => {
    const seen = new Set<string>();
    const out: { i: number; lm: Landmark }[] = [];
    grid.forEach((t, i) => {
      if (t.kind !== "landmark" || !t.landmark || seen.has(t.landmark.name)) return;
      seen.add(t.landmark.name);
      out.push({ i, lm: t.landmark });
    });
    return out;
  }, [grid]);
  return (
    <group>
      {labels.map(({ i, lm }) => (
        <Html
          key={i}
          position={[tileX(i), lm.height * (LABEL_HEIGHT[lm.shape] ?? 0.9) + 0.35, tileZ(i)]}
          center
          zIndexRange={[10, 0]}
        >
          <div className="pointer-events-none whitespace-nowrap rounded-sm bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white">
            {lm.name}
          </div>
        </Html>
      ))}
    </group>
  );
}

export function TileFx({ grid }: { grid: Tile[] }) {
  return (
    <group>
      {grid.map((t, i) => {
        const special = t.kind === "landmark" || t.kind === "rubble" || t.fire > 0 || t.flood > 0;
        if (!special) return null;
        return (
          <group key={i} position={[tileX(i), 0, tileZ(i)]}>
            {t.kind === "landmark" && t.landmark && (
              <PopIn key={`lm-${t.builtDay}`}>
                <LandmarkMesh lm={t.landmark} />
              </PopIn>
            )}
            {t.kind === "rubble" && <Rubble seed={i + t.builtDay} />}
            {t.fire > 0 && <Fire seed={i} y={roofHeight(t)} />}
            {t.flood > 0 && (
              <mesh position={[0, 0.1, 0]}>
                <boxGeometry args={[1, 0.14, 1]} />
                <meshStandardMaterial color="#3b8fd6" transparent opacity={0.6} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

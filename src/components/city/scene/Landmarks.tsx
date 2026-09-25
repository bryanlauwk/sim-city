import { useContext, useMemo } from "react";
import * as THREE from "three";
import type { Landmark } from "@/lib/city/types";
import { buildingGlow } from "./facade";
import { hash } from "./common";
import { UpsideContext } from "./upside";

/**
 * Maple Hollow's landmarks, from the lab on the hill to the diner on Main
 * Street, plus the generic structures an event can put up. Inside an
 * <UpsideDownWorld> the same meshes come out drained of colour, every sign
 * and window dead.
 */

const UPSIDE_TINT = new THREE.Color(0.42, 0.46, 0.56);
function drained(color: string): THREE.Color {
  const c = new THREE.Color(color);
  const grey = c.r * 0.3 + c.g * 0.5 + c.b * 0.2;
  return new THREE.Color(grey, grey, grey).lerp(c, 0.12).multiply(UPSIDE_TINT);
}

export function Mat({
  color,
  metal = 0,
  roughness = 0.7,
  transparent = false,
  opacity = 1,
}: {
  color: string;
  metal?: number;
  roughness?: number;
  transparent?: boolean;
  opacity?: number;
}) {
  const upside = useContext(UpsideContext);
  const c = useMemo(() => (upside ? drained(color) : new THREE.Color(color)), [color, upside]);
  return (
    <meshStandardMaterial
      color={c}
      roughness={roughness}
      metalness={metal * 0.25}
      transparent={transparent}
      opacity={opacity}
    />
  );
}

const glowCache = new Map<string, THREE.MeshStandardMaterial>();

/** Neon, marquees and lit windows: dim by day, bright at night (dead in the Upside Down). */
function glowMaterial(color: string, upside: boolean): THREE.MeshStandardMaterial {
  const key = `${color}:${upside}`;
  let m = glowCache.get(key);
  if (m) return m;
  if (upside) {
    m = new THREE.MeshStandardMaterial({
      color: drained(color).multiplyScalar(0.6),
      roughness: 0.8,
    });
  } else {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, roughness: 0.5 });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = buildingGlow;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uGlow;")
        .replace(
          "#include <emissivemap_fragment>",
          "#include <emissivemap_fragment>\ntotalEmissiveRadiance = diffuseColor.rgb * (0.25 + uGlow * 2.4);",
        );
    };
  }
  glowCache.set(key, m);
  return m;
}

function Glow({ color }: { color: string }) {
  const upside = useContext(UpsideContext);
  return <primitive object={glowMaterial(color, upside)} attach="material" />;
}

type V3 = [number, number, number];

function Box({
  p,
  s,
  color,
  glow,
  rot,
  shadow = true,
}: {
  p: V3;
  s: V3;
  color: string;
  glow?: boolean;
  rot?: V3;
  shadow?: boolean;
}) {
  return (
    <mesh castShadow={shadow} receiveShadow position={p} rotation={rot}>
      <boxGeometry args={s} />
      {glow ? <Glow color={color} /> : <Mat color={color} />}
    </mesh>
  );
}

function Cyl({
  p,
  r,
  h,
  color,
  top,
  seg = 12,
  glow,
  rot,
}: {
  p: V3;
  r: number;
  h: number;
  color: string;
  top?: number;
  seg?: number;
  glow?: boolean;
  rot?: V3;
}) {
  return (
    <mesh castShadow position={p} rotation={rot}>
      <cylinderGeometry args={[top ?? r, r, h, seg]} />
      {glow ? <Glow color={color} /> : <Mat color={color} />}
    </mesh>
  );
}

/** A gable roof: ridge along x, or along z with `alongZ`. */
function Roof({ p, s, color, alongZ = false }: { p: V3; s: V3; color: string; alongZ?: boolean }) {
  const geo = useMemo(() => {
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.5, -0.5),
      new THREE.Vector2(0.5, -0.5),
      new THREE.Vector2(0, 0.5),
    ]);
    const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false });
    g.translate(0, 0, -0.5);
    g.rotateY(Math.PI / 2);
    return g;
  }, []);
  return (
    <mesh
      castShadow
      geometry={geo}
      position={p}
      scale={s}
      rotation={[0, alongZ ? Math.PI / 2 : 0, 0]}
    >
      <Mat color={color} roughness={0.9} />
    </mesh>
  );
}

/** A row of windows on the +z face. */
function Windows({
  n,
  width,
  y,
  z,
  w = 0.06,
  h = 0.07,
  lit = 0.4,
  seed = 1,
}: {
  n: number;
  width: number;
  y: number;
  z: number;
  w?: number;
  h?: number;
  lit?: number;
  seed?: number;
}) {
  return (
    <group>
      {Array.from({ length: n }, (_, k) => (
        <Box
          key={k}
          p={[-width / 2 + (width / n) * (k + 0.5), y, z]}
          s={[w, h, 0.01]}
          color={hash(seed, k) < lit ? "#ffcf7a" : "#34404e"}
          glow={hash(seed, k) < lit}
          shadow={false}
        />
      ))}
    </group>
  );
}

function Lab({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const fence = 0.48;
  return (
    <group>
      <Box p={[0, h * 0.25, -0.05]} s={[0.8, h * 0.5, 0.42]} color={lm.color} />
      <Windows n={9} width={0.72} y={h * 0.18} z={0.162} w={0.05} h={0.04} lit={0.3} seed={11} />
      <Windows n={9} width={0.72} y={h * 0.36} z={0.162} w={0.05} h={0.04} lit={0.3} seed={12} />
      <Box p={[-0.24, h * 0.55, -0.1]} s={[0.24, h * 0.5, 0.24]} color={lm.color} />
      <Box p={[0, h * 0.5 + 0.01, -0.05]} s={[0.82, 0.02, 0.44]} color="#b9b9b2" />
      {/* The dish */}
      <group position={[0.24, h * 0.5 + 0.08, -0.08]} rotation={[-0.6, 0.4, 0]}>
        <mesh castShadow>
          <sphereGeometry args={[0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
          <Mat color="#f2f2ee" />
        </mesh>
      </group>
      <Cyl p={[-0.24, h * 0.8 + 0.12, -0.1]} r={0.008} h={0.26} color="#8a8f96" />
      <Box p={[-0.24, h * 0.8 + 0.26, -0.1]} s={[0.025, 0.025, 0.025]} color="#ff3b30" glow />
      {/* Chain-link fence and the guard booth */}
      {[
        [0, -fence, 0],
        [0, fence, 0],
        [-fence, 0, 1],
        [fence, 0, 1],
      ].map(([x, z, turn], k) => (
        <mesh key={k} position={[x, 0.05, z]} rotation={[0, turn ? Math.PI / 2 : 0, 0]}>
          <boxGeometry args={[0.96, 0.1, 0.004]} />
          <Mat color="#a3a9ad" transparent opacity={0.45} metal={0.6} />
        </mesh>
      ))}
      <Box p={[0.3, 0.05, fence - 0.04]} s={[0.07, 0.1, 0.07]} color="#e4e1d6" />
      <Box p={[0.14, 0.04, fence]} s={[0.22, 0.012, 0.012]} color="#e1b12c" />
      <Box p={[-0.3, 0.1, fence + 0.004]} s={[0.12, 0.06, 0.006]} color="#e1b12c" />
    </group>
  );
}

function RadioTower({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const bands = 7;
  return (
    <group>
      {Array.from({ length: bands }, (_, k) => {
        const y0 = (k / bands) * h;
        const r0 = 0.16 * (1 - k / bands) + 0.02;
        const r1 = 0.16 * (1 - (k + 1) / bands) + 0.02;
        return (
          <mesh key={k} position={[0, y0 + h / bands / 2, 0]}>
            <cylinderGeometry args={[r1, r0, h / bands, 3, 2, true]} />
            <meshStandardMaterial color={k % 2 ? "#f2f2ee" : lm.color} wireframe roughness={0.6} />
          </mesh>
        );
      })}
      <Cyl p={[0, h / 2, 0]} r={0.012} h={h} color="#8a8f96" />
      <Box p={[0, h + 0.03, 0]} s={[0.05, 0.05, 0.05]} color="#ff3b30" glow />
      <Box p={[0, h * 0.5, 0]} s={[0.04, 0.04, 0.04]} color="#ff3b30" glow />
      <Box p={[0.25, 0.07, 0.2]} s={[0.2, 0.14, 0.16]} color="#d9d2c3" />
    </group>
  );
}

function Cabin({ lm }: { lm: Landmark }) {
  return (
    <group rotation={[0, 0.4, 0]}>
      <Box p={[0, 0.1, 0]} s={[0.4, 0.2, 0.3]} color={lm.color} />
      <Roof p={[0, 0.26, 0]} s={[0.46, 0.13, 0.38]} color="#4a3a2c" />
      <Box p={[0.14, 0.26, -0.06]} s={[0.05, 0.22, 0.05]} color="#7a7470" />
      <Box p={[0, 0.03, 0.2]} s={[0.4, 0.02, 0.1]} color="#6b5a44" />
      <Box p={[-0.08, 0.1, 0.152]} s={[0.07, 0.06, 0.01]} color="#ffcf7a" glow />
      <Box p={[0.05, 0.08, 0.152]} s={[0.06, 0.13, 0.01]} color="#3a2c20" />
    </group>
  );
}

function WaterTower({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const leg = h * 0.62;
  return (
    <group>
      {[
        [-0.14, -0.14],
        [0.14, -0.14],
        [-0.14, 0.14],
        [0.14, 0.14],
      ].map(([x, z], k) => (
        <Cyl key={k} p={[x, leg / 2, z]} r={0.014} h={leg} color="#8d9296" />
      ))}
      <Cyl p={[0, leg * 0.5, 0]} r={0.2} top={0.2} h={0.012} color="#8d9296" seg={4} />
      <Cyl p={[0, leg + 0.2, 0]} r={0.26} h={0.4} color={lm.color} seg={18} />
      <mesh castShadow position={[0, leg + 0.5, 0]}>
        <coneGeometry args={[0.27, 0.2, 18]} />
        <Mat color="#a9b2b8" />
      </mesh>
      <mesh position={[0, leg + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.28, 0.008, 4, 24]} />
        <Mat color="#6f757a" />
      </mesh>
      {/* The town's name, painted round the tank */}
      <Cyl p={[0, leg + 0.22, 0]} r={0.262} h={0.08} color="#2d4f8f" seg={18} />
      <Box p={[0, leg + 0.62, 0]} s={[0.03, 0.03, 0.03]} color="#ff3b30" glow />
    </group>
  );
}

function Victorian({ lm }: { lm: Landmark }) {
  const h = lm.height;
  return (
    <group>
      <Box p={[-0.06, h * 0.3, -0.04]} s={[0.46, h * 0.6, 0.4]} color={lm.color} />
      <Roof p={[-0.06, h * 0.6 + 0.12, -0.04]} s={[0.5, 0.26, 0.44]} color="#3a3440" />
      <Roof p={[-0.12, h * 0.6 + 0.08, 0.14]} s={[0.2, 0.18, 0.12]} color="#3a3440" alongZ />
      {/* The turret */}
      <Cyl p={[0.24, h * 0.4, 0.1]} r={0.1} h={h * 0.8} color={lm.color} seg={8} />
      <mesh castShadow position={[0.24, h * 0.8 + 0.12, 0.1]}>
        <coneGeometry args={[0.13, 0.26, 8]} />
        <Mat color="#3a3440" />
      </mesh>
      <Cyl p={[0.24, h * 0.8 + 0.28, 0.1]} r={0.004} h={0.08} color="#2a2a2a" />
      {/* The porch */}
      <Box p={[-0.06, 0.1, 0.2]} s={[0.46, 0.012, 0.1]} color="#d8d2c4" />
      {[-0.26, -0.06, 0.14].map((x) => (
        <Cyl key={x} p={[x, 0.05, 0.24]} r={0.008} h={0.1} color="#d8d2c4" />
      ))}
      <Windows n={3} width={0.38} y={h * 0.42} z={0.162} w={0.05} h={0.09} lit={0.2} seed={31} />
      <Windows n={2} width={0.3} y={h * 0.16} z={0.162} w={0.06} h={0.09} lit={0} seed={32} />
      {/* One window in the turret, always lit */}
      <Box p={[0.24, h * 0.62, 0.2]} s={[0.04, 0.07, 0.01]} color="#ffb36a" glow />
    </group>
  );
}

function Church({ lm }: { lm: Landmark }) {
  const h = lm.height;
  return (
    <group>
      <Box p={[0, 0.16, -0.08]} s={[0.36, 0.32, 0.56]} color={lm.color} />
      <Roof p={[0, 0.41, -0.08]} s={[0.4, 0.18, 0.6]} color="#5d5a57" alongZ />
      <Box p={[0, h * 0.3, 0.24]} s={[0.16, h * 0.6, 0.16]} color={lm.color} />
      <mesh castShadow position={[0, h * 0.6 + h * 0.2, 0.24]} rotation={[0, Math.PI / 4, 0]}>
        <coneGeometry args={[0.12, h * 0.4, 4]} />
        <Mat color="#5d5a57" />
      </mesh>
      <Box p={[0, 0.07, 0.322]} s={[0.07, 0.13, 0.01]} color="#8e2b2b" />
      <Box p={[0, h * 0.45, 0.322]} s={[0.06, 0.06, 0.01]} color="#e6b35a" glow />
      {[-0.12, 0.12].map((z) =>
        [-0.182, 0.182].map((x) => (
          <Box
            key={`${x}${z}`}
            p={[x, 0.18, z - 0.08]}
            s={[0.01, 0.12, 0.06]}
            color="#c98a5a"
            glow
          />
        )),
      )}
    </group>
  );
}

function Cinema({ lm }: { lm: Landmark }) {
  return (
    <group>
      <Box p={[0, 0.3, -0.06]} s={[0.8, 0.6, 0.76]} color={lm.color} />
      {/* The marquee and its bulbs */}
      <Box p={[0, 0.3, 0.38]} s={[0.66, 0.14, 0.16]} color="#f4f1ea" />
      <Box p={[0, 0.3, 0.462]} s={[0.6, 0.1, 0.01]} color="#fff2c4" glow />
      <Box p={[0, 0.225, 0.4]} s={[0.66, 0.012, 0.16]} color="#ffd36a" glow />
      {/* The blade sign */}
      <Box p={[0, 0.72, 0.36]} s={[0.1, 0.46, 0.04]} color="#e84393" glow />
      <Box p={[0, 0.72, 0.335]} s={[0.12, 0.48, 0.01]} color="#f4f1ea" />
      <Box p={[0, 0.1, 0.322]} s={[0.4, 0.16, 0.01]} color="#34404e" />
      {[-0.3, 0.3].map((x) => (
        <Box key={x} p={[x, 0.11, 0.322]} s={[0.1, 0.14, 0.01]} color="#f18f01" glow />
      ))}
    </group>
  );
}

function TownHall({ lm }: { lm: Landmark }) {
  const h = lm.height;
  return (
    <group>
      <Box p={[0, 0.22, -0.06]} s={[0.84, 0.44, 0.64]} color={lm.color} />
      <Windows n={6} width={0.72} y={0.3} z={0.262} lit={0.3} seed={41} />
      {/* Portico: columns and a pediment */}
      {[-0.18, -0.06, 0.06, 0.18].map((x) => (
        <Cyl key={x} p={[x, 0.17, 0.33]} r={0.022} h={0.34} color="#f2ede2" seg={8} />
      ))}
      <Roof p={[0, 0.39, 0.33]} s={[0.5, 0.1, 0.14]} color="#f2ede2" />
      <Box p={[0, 0.34, 0.33]} s={[0.5, 0.02, 0.14]} color="#f2ede2" />
      {/* The clock tower */}
      <Box
        p={[0, 0.44 + (h - 0.44) * 0.4, -0.06]}
        s={[0.2, (h - 0.44) * 0.8, 0.2]}
        color="#d8cfc0"
      />
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((a) => (
        <mesh
          key={a}
          position={[Math.sin(a) * 0.102, 0.44 + (h - 0.44) * 0.62, -0.06 + Math.cos(a) * 0.102]}
          rotation={[0, a, 0]}
        >
          <circleGeometry args={[0.07, 20]} />
          <Glow color="#fff6dc" />
        </mesh>
      ))}
      <mesh castShadow position={[0, h + 0.02, -0.06]}>
        <sphereGeometry args={[0.12, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#4c8a78" metal={0.3} />
      </mesh>
      <Cyl p={[0.36, 0.3, 0.3]} r={0.006} h={0.6} color="#f2f2f2" />
      <Box p={[0.42, 0.55, 0.3]} s={[0.12, 0.07, 0.004]} color="#b22234" />
    </group>
  );
}

function Storefront({
  lm,
  sign,
  front,
  neon = [],
}: {
  lm: Landmark;
  sign: string;
  front: string;
  neon?: string[];
}) {
  return (
    <group>
      <Box p={[0, 0.2, -0.04]} s={[0.84, 0.4, 0.78]} color={lm.color} />
      <Box p={[0, 0.12, 0.352]} s={[0.72, 0.18, 0.01]} color={front} glow />
      <Box p={[0, 0.32, 0.37]} s={[0.76, 0.1, 0.04]} color={sign} glow />
      {neon.map((c, k) => (
        <Box
          key={k}
          p={[0, 0.02 + 0.06 * k, 0.37]}
          s={[0.84, 0.012, 0.012]}
          color={c}
          glow
          shadow={false}
        />
      ))}
    </group>
  );
}

function Diner({ lm }: { lm: Landmark }) {
  return (
    <group>
      {/* Streamlined railcar diner: a rounded steel body with a red stripe */}
      <mesh
        castShadow
        position={[0, 0.14, -0.02]}
        rotation={[0, 0, Math.PI / 2]}
        scale={[1, 1, 0.8]}
      >
        <cylinderGeometry args={[0.16, 0.16, 0.82, 16]} />
        <Mat color={lm.color} metal={0.9} roughness={0.25} />
      </mesh>
      <Box p={[0, 0.08, 0.108]} s={[0.8, 0.03, 0.01]} color="#c0392b" />
      <Box p={[0, 0.17, 0.118]} s={[0.7, 0.07, 0.01]} color="#ffe6a8" glow />
      <Cyl p={[0.36, 0.3, 0.3]} r={0.01} h={0.6} color="#777777" />
      <Box p={[0.36, 0.62, 0.3]} s={[0.26, 0.12, 0.03]} color="#ff4f7b" glow />
      <Box p={[0.36, 0.52, 0.3]} s={[0.2, 0.05, 0.03]} color="#3fd0ff" glow />
    </group>
  );
}

function GasStation({ lm }: { lm: Landmark }) {
  return (
    <group>
      <Box p={[0, 0.26, 0.1]} s={[0.7, 0.04, 0.4]} color={lm.color} />
      <Box p={[0, 0.24, 0.1]} s={[0.66, 0.006, 0.36]} color="#fff6dc" glow shadow={false} />
      <Box p={[0, 0.29, 0.1]} s={[0.72, 0.03, 0.42]} color="#c0392b" />
      {[
        [-0.3, -0.06],
        [0.3, -0.06],
        [-0.3, 0.26],
        [0.3, 0.26],
      ].map(([x, z], k) => (
        <Cyl key={k} p={[x, 0.12, z]} r={0.015} h={0.24} color="#dddddd" />
      ))}
      {[-0.12, 0.12].map((x) => (
        <Box key={x} p={[x, 0.05, 0.1]} s={[0.05, 0.1, 0.04]} color="#c0392b" />
      ))}
      <Box p={[0, 0.08, -0.3]} s={[0.36, 0.16, 0.2]} color="#e8e2d4" />
      <Box p={[0, 0.08, -0.198]} s={[0.26, 0.08, 0.01]} color="#ffe6a8" glow />
      <Cyl p={[-0.38, 0.3, 0.38]} r={0.01} h={0.6} color="#777777" />
      <Box p={[-0.38, 0.6, 0.38]} s={[0.16, 0.14, 0.03]} color="#f5f0e0" glow />
      <Box p={[-0.38, 0.66, 0.4]} s={[0.16, 0.03, 0.01]} color="#c0392b" />
    </group>
  );
}

function School({ lm }: { lm: Landmark }) {
  const h = lm.height;
  return (
    <group>
      <Box p={[0, h * 0.2, -0.12]} s={[0.9, h * 0.4, 0.3]} color={lm.color} />
      <Box p={[-0.36, h * 0.15, 0.16]} s={[0.18, h * 0.3, 0.3]} color={lm.color} />
      <Box p={[0.36, h * 0.15, 0.16]} s={[0.18, h * 0.3, 0.3]} color={lm.color} />
      <Windows n={10} width={0.84} y={h * 0.12} z={0.032} w={0.05} h={0.05} lit={0.15} seed={51} />
      <Windows n={10} width={0.84} y={h * 0.28} z={0.032} w={0.05} h={0.05} lit={0.15} seed={52} />
      {/* The entrance and its columns */}
      <Box p={[0, h * 0.2, 0.06]} s={[0.24, h * 0.4, 0.06]} color="#e8e0d0" />
      {[-0.08, 0, 0.08].map((x) => (
        <Cyl key={x} p={[x, h * 0.17, 0.1]} r={0.015} h={h * 0.34} color="#f4f1ea" seg={8} />
      ))}
      <Box p={[0, h * 0.42, 0.06]} s={[0.26, 0.03, 0.08]} color="#f4f1ea" />
      <Box p={[0, h * 0.36, 0.092]} s={[0.18, 0.04, 0.005]} color="#1f3a6b" />
      <Cyl p={[0.18, 0.25, 0.3]} r={0.006} h={0.5} color="#f2f2f2" />
      <Box p={[0.24, 0.46, 0.3]} s={[0.12, 0.07, 0.004]} color="#b22234" />
    </group>
  );
}

function FootballField({ lm }: { lm: Landmark }) {
  return (
    <group>
      <mesh receiveShadow position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[0.9, 0.56]} />
        <Mat color={lm.color} roughness={1} />
      </mesh>
      {Array.from({ length: 9 }, (_, k) => (
        <Box
          key={k}
          p={[-0.4 + k * 0.1, 0.014, 0]}
          s={[0.006, 0.002, 0.52]}
          color="#f4f4ee"
          shadow={false}
        />
      ))}
      {[-0.44, 0.44].map((x) => (
        <group key={x} position={[x, 0, 0]}>
          <Cyl p={[0, 0.06, 0]} r={0.005} h={0.12} color="#e1b12c" />
          <Box p={[0, 0.12, 0]} s={[0.006, 0.006, 0.12]} color="#e1b12c" />
        </group>
      ))}
      {/* Bleachers */}
      {[0, 1, 2].map((k) => (
        <Box
          key={k}
          p={[0, 0.02 + k * 0.03, -0.34 - k * 0.04]}
          s={[0.7, 0.03, 0.05]}
          color="#b9bdbd"
        />
      ))}
      {/* Friday night lights */}
      {[
        [-0.46, -0.34],
        [0.46, -0.34],
        [-0.46, 0.34],
        [0.46, 0.34],
      ].map(([x, z], k) => (
        <group key={k} position={[x, 0, z]}>
          <Cyl p={[0, 0.3, 0]} r={0.008} h={0.6} color="#8d9296" />
          <Box p={[0, 0.6, 0]} s={[0.1, 0.05, 0.02]} color="#fffbe6" glow />
        </group>
      ))}
    </group>
  );
}

function Mall({ lm }: { lm: Landmark }) {
  return (
    <group>
      <Box p={[0, 0.16, -0.05]} s={[0.94, 0.32, 0.8]} color={lm.color} />
      {/* The glass atrium */}
      <mesh castShadow position={[0, 0.32, -0.05]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.16, 0.16, 0.6, 16, 1, false, 0, Math.PI]} />
        <Mat color="#9cc3d8" roughness={0.15} transparent opacity={0.8} />
      </mesh>
      {/* Anchor stores at either end */}
      <Box p={[-0.38, 0.22, -0.05]} s={[0.2, 0.44, 0.84]} color="#c9b89c" />
      <Box p={[0.38, 0.22, -0.05]} s={[0.2, 0.44, 0.84]} color="#b8c4c9" />
      <Box p={[-0.38, 0.36, 0.372]} s={[0.16, 0.06, 0.01]} color="#e84393" glow />
      <Box p={[0.38, 0.36, 0.372]} s={[0.16, 0.06, 0.01]} color="#2e86ab" glow />
      {/* The entrance and the sign */}
      <Box p={[0, 0.1, 0.36]} s={[0.26, 0.2, 0.04]} color="#fff2c4" glow />
      <Box p={[0, 0.27, 0.37]} s={[0.4, 0.07, 0.02]} color="#f18f01" glow />
    </group>
  );
}

function Junkyard({ lm }: { lm: Landmark }) {
  const wrecks = useMemo(
    () =>
      Array.from({ length: 14 }, (_, k) => ({
        p: [
          (hash(k, 1) - 0.5) * 0.76,
          0.035 + Math.floor(hash(k, 2) * 3) * 0.06,
          (hash(k, 3) - 0.5) * 0.76,
        ] as V3,
        r: [0, hash(k, 4) * Math.PI, (hash(k, 5) - 0.5) * 0.4] as V3,
        c: ["#7d4a3a", "#556b7a", "#8a7a4a", "#6a6a6a", "#9a5a2a", "#3a5a4a"][k % 6],
      })),
    [],
  );
  return (
    <group>
      {wrecks.map((w, k) => (
        <Box key={k} p={w.p} s={[0.18, 0.06, 0.09]} color={w.c} rot={w.r} />
      ))}
      {/* The crane with its magnet */}
      <Cyl p={[0.3, 0.3, -0.3]} r={0.015} h={0.6} color="#e1b12c" />
      <Box p={[0.14, 0.6, -0.3]} s={[0.34, 0.02, 0.02]} color="#e1b12c" />
      <Cyl p={[-0.02, 0.44, -0.3]} r={0.004} h={0.3} color="#333333" />
      <Cyl p={[-0.02, 0.28, -0.3]} r={0.05} h={0.02} color="#444444" />
      <Box p={[-0.3, 0.07, 0.34]} s={[0.2, 0.14, 0.14]} color={lm.color} />
    </group>
  );
}

function Barn({ lm }: { lm: Landmark }) {
  return (
    <group>
      <Box p={[0, 0.16, 0]} s={[0.42, 0.32, 0.56]} color={lm.color} />
      <Roof p={[0, 0.4, 0]} s={[0.46, 0.16, 0.6]} color="#4f4a46" alongZ />
      <Box p={[0, 0.12, 0.282]} s={[0.2, 0.22, 0.01]} color="#f4f1ea" />
      <Box p={[0, 0.12, 0.286]} s={[0.26, 0.012, 0.004]} color="#f4f1ea" rot={[0, 0, 0.8]} />
      <Box p={[0, 0.12, 0.286]} s={[0.26, 0.012, 0.004]} color="#f4f1ea" rot={[0, 0, -0.8]} />
      <Cyl p={[0.34, 0.34, -0.1]} r={0.1} h={0.68} color="#c9ccc9" seg={14} />
      <mesh castShadow position={[0.34, 0.68, -0.1]}>
        <sphereGeometry args={[0.1, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Mat color="#8d8883" />
      </mesh>
    </group>
  );
}

function Billboard({ lm }: { lm: Landmark }) {
  const h = Math.max(0.6, lm.height);
  return (
    <group>
      {[-0.2, 0.2].map((x) => (
        <Cyl key={x} p={[x, h * 0.4, 0]} r={0.012} h={h * 0.8} color="#6a5a48" />
      ))}
      <Box p={[0, h * 0.85, 0]} s={[0.7, 0.3, 0.03]} color="#f4f1ea" />
      <Box p={[0, h * 0.85, 0.018]} s={[0.64, 0.24, 0.005]} color={lm.color} glow />
    </group>
  );
}

export function LandmarkMesh({ lm }: { lm: Landmark }) {
  const h = lm.height;
  const mat = <Mat color={lm.color} />;
  switch (lm.shape) {
    case "lab":
      return <Lab lm={lm} />;
    case "radio_tower":
      return <RadioTower lm={lm} />;
    case "cabin":
      return <Cabin lm={lm} />;
    case "water_tower":
      return <WaterTower lm={lm} />;
    case "victorian":
      return <Victorian lm={lm} />;
    case "church":
      return <Church lm={lm} />;
    case "cinema":
      return <Cinema lm={lm} />;
    case "town_hall":
      return <TownHall lm={lm} />;
    case "video_store":
      return <Storefront lm={lm} sign="#2e86ab" front="#ffe28a" neon={["#ffbe0b"]} />;
    case "arcade":
      return <Storefront lm={lm} sign="#ff4fd8" front="#5ad1ff" neon={["#ff4fd8", "#5ad1ff"]} />;
    case "police":
      return (
        <group>
          <Storefront lm={lm} sign="#1d3f94" front="#fff2c4" />
          <Cyl p={[0.36, 0.3, 0.36]} r={0.006} h={0.6} color="#f2f2f2" />
          <Box p={[0.42, 0.55, 0.36]} s={[0.12, 0.07, 0.004]} color="#b22234" />
        </group>
      );
    case "diner":
      return <Diner lm={lm} />;
    case "gas_station":
      return <GasStation lm={lm} />;
    case "school":
      return <School lm={lm} />;
    case "stadium":
      return <FootballField lm={lm} />;
    case "mall":
      return <Mall lm={lm} />;
    case "junkyard":
      return <Junkyard lm={lm} />;
    case "barn":
      return <Barn lm={lm} />;
    case "billboard":
      return <Billboard lm={lm} />;
    case "plaza":
      return (
        <group>
          <mesh receiveShadow position={[0, 0.012, 0]}>
            <boxGeometry args={[0.98, 0.02, 0.98]} />
            <Mat color="#c9c2b0" />
          </mesh>
          {[-0.3, 0.3].map((x) => (
            <mesh key={x} castShadow position={[x, 0.08, 0.3]}>
              <sphereGeometry args={[0.1, 6, 5]} />
              <Mat color="#b5652d" />
            </mesh>
          ))}
        </group>
      );
    case "flagpole":
      return (
        <group>
          <Cyl p={[0, h / 2, 0]} r={0.015} top={0.012} h={h} color="#f2f2f2" seg={6} />
          {Array.from({ length: 7 }, (_, k) => (
            <Box
              key={k}
              p={[0.17, h - 0.02 - k * 0.026, 0]}
              s={[0.32, 0.026, 0.01]}
              color={k % 2 ? "#f4f4f4" : "#b22234"}
              shadow={false}
            />
          ))}
          <Box p={[0.08, h - 0.06, 0.006]} s={[0.14, 0.09, 0.01]} color="#3c3b6e" shadow={false} />
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
            <Mat color="#2b241f" roughness={0.96} />
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
          <Box p={[0, 0.1, 0]} s={[0.5, 0.2, 0.5]} color="#b8b2a6" />
          <mesh castShadow position={[0, 0.2 + h * 0.4, 0]}>
            <capsuleGeometry args={[0.12, h * 0.6, 3, 6]} />
            {mat}
          </mesh>
          <mesh castShadow position={[0, 0.2 + h * 0.85, 0]}>
            <sphereGeometry args={[0.1, 8, 6]} />
            {mat}
          </mesh>
        </group>
      );
  }
}

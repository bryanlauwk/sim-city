import { useMemo } from "react";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { districtAt } from "@/lib/city/kl";
import { hash, N, tileX, tileZ } from "./common";

interface StallSpot {
  tile: number;
  x: number;
  z: number;
  side: number;
  awning: string;
  cart: string;
}

interface BusStopSpot {
  tile: number;
  x: number;
  z: number;
  alongX: boolean;
}

interface DrainSpot {
  tile: number;
  x: number;
  z: number;
  alongX: boolean;
}

const AWNINGS = ["#bd332d", "#19816f", "#e1ae43", "#315f99"];
const CARTS = ["#d8d4c6", "#687a7a", "#b8a57a"];
const steel = new THREE.MeshStandardMaterial({
  color: "#aab3b4",
  metalness: 0.55,
  roughness: 0.34,
});
const charcoal = new THREE.MeshStandardMaterial({ color: "#2b2c2c", roughness: 0.75 });
const lantern = new THREE.MeshStandardMaterial({
  color: "#d52422",
  emissive: "#f02c19",
  emissiveIntensity: 0.55,
  roughness: 0.4,
});
const shelterGlass = new THREE.MeshPhysicalMaterial({
  color: "#a8cbd0",
  metalness: 0.12,
  roughness: 0.24,
  transparent: true,
  opacity: 0.55,
  clearcoat: 0.7,
});
const rapidRed = new THREE.MeshStandardMaterial({ color: "#d6262e", roughness: 0.5 });
const signWhite = new THREE.MeshStandardMaterial({ color: "#f4f0e6", roughness: 0.82 });
const drainDark = new THREE.MeshStandardMaterial({
  color: "#30363a",
  metalness: 0.35,
  roughness: 0.82,
});

/** Small food carts and lanterns give Jalan Alor a distinct night-market edge. */
export function KLStreetProps({ grid }: { grid: Tile[] }) {
  const stalls = useMemo(() => {
    const out: StallSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road") return;
      const district = districtAt(i).id;
      const chance = district === "jalan_alor" ? 0.58 : district === "changkat" ? 0.18 : 0;
      // Keep the roadside clear where the existing rain trees are planted.
      if (!chance || hash(i, 101) > chance || hash(i, 77) < 0.33) return;
      const side = hash(i, 103) < 0.5 ? -1 : 1;
      out.push({
        tile: i,
        x: tileX(i) + side * 0.39,
        z: tileZ(i) + (hash(i, 104) - 0.5) * 0.34,
        side,
        awning: AWNINGS[Math.floor(hash(i, 105) * AWNINGS.length)],
        cart: CARTS[Math.floor(hash(i, 106) * CARTS.length)],
      });
    });
    return out;
  }, [grid]);

  const busStops = useMemo(() => {
    const out: BusStopSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road") return;
      const district = districtAt(i).id;
      if (
        !(
          district === "klcc" ||
          district === "bukit_bintang" ||
          district === "dang_wangi" ||
          district === "raja_chulan"
        )
      )
        return;
      if (hash(i, 109) > 0.025 || hash(i, 77) < 0.4) return;
      const x = i % N;
      const y = Math.floor(i / N);
      const horizontal =
        (x > 0 && grid[i - 1]?.kind === "road") || (x < N - 1 && grid[i + 1]?.kind === "road");
      const vertical =
        (y > 0 && grid[i - N]?.kind === "road") || (y < N - 1 && grid[i + N]?.kind === "road");
      if (!horizontal && !vertical) return;
      const alongX = horizontal && (!vertical || hash(i, 211) < 0.5);
      const side = hash(i, 223) < 0.5 ? -1 : 1;
      out.push({
        tile: i,
        x: tileX(i) + (alongX ? 0 : side * 0.33),
        z: tileZ(i) + (alongX ? side * 0.33 : 0),
        alongX,
      });
    });
    return out;
  }, [grid]);

  const drains = useMemo(() => {
    const out: DrainSpot[] = [];
    grid.forEach((tile, i) => {
      if (tile.kind !== "road" || hash(i, 227) > 0.11) return;
      const x = i % N;
      const y = Math.floor(i / N);
      const horizontal =
        (x > 0 && grid[i - 1]?.kind === "road") || (x < N - 1 && grid[i + 1]?.kind === "road");
      const vertical =
        (y > 0 && grid[i - N]?.kind === "road") || (y < N - 1 && grid[i + N]?.kind === "road");
      const alongX = horizontal && (!vertical || hash(i, 229) < 0.5);
      const curb = hash(i, 233) < 0.5 ? -0.42 : 0.42;
      out.push({
        tile: i,
        x: tileX(i) + (alongX ? 0 : curb),
        z: tileZ(i) + (alongX ? curb : 0),
        alongX,
      });
    });
    return out;
  }, [grid]);

  return (
    <group>
      {/* Covered monsoon drains and curb grates, a small KL street detail. */}
      {drains.map((drain) => (
        <group key={`drain-${drain.tile}`} position={[drain.x, 0.015, drain.z]}>
          <mesh rotation={[0, drain.alongX ? 0 : Math.PI / 2, 0]}>
            <boxGeometry args={[0.26, 0.008, 0.075]} />
            <primitive object={drainDark} attach="material" />
          </mesh>
          {[-0.025, 0, 0.025].map((z) => (
            <mesh
              key={z}
              position={[0, 0.006, z]}
              rotation={[0, drain.alongX ? 0 : Math.PI / 2, 0]}
            >
              <boxGeometry args={[0.2, 0.004, 0.006]} />
              <primitive object={steel} attach="material" />
            </mesh>
          ))}
        </group>
      ))}
      {/* Rapid KL shelter: red route panel, clear rain screen and curbside bench. */}
      {busStops.map((stop) => (
        <group
          key={`bus-stop-${stop.tile}`}
          position={[stop.x, 0, stop.z]}
          rotation={[0, stop.alongX ? 0 : Math.PI / 2, 0]}
        >
          {[-0.2, 0.2].map((x) => (
            <mesh key={x} position={[x, 0.23, 0]}>
              <cylinderGeometry args={[0.009, 0.012, 0.44, 8]} />
              <primitive object={steel} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.47, 0]} castShadow>
            <boxGeometry args={[0.48, 0.025, 0.2]} />
            <primitive object={steel} attach="material" />
          </mesh>
          <mesh position={[0, 0.31, -0.085]}>
            <boxGeometry args={[0.4, 0.24, 0.012]} />
            <primitive object={shelterGlass} attach="material" />
          </mesh>
          <mesh position={[0.145, 0.4, 0.11]}>
            <boxGeometry args={[0.12, 0.09, 0.012]} />
            <primitive object={rapidRed} attach="material" />
          </mesh>
          <mesh position={[0.145, 0.402, 0.118]}>
            <boxGeometry args={[0.075, 0.012, 0.004]} />
            <primitive object={signWhite} attach="material" />
          </mesh>
          <mesh position={[0, 0.09, 0.1]}>
            <boxGeometry args={[0.27, 0.025, 0.08]} />
            <primitive object={rapidRed} attach="material" />
          </mesh>
          <mesh position={[0, 0.018, 0.1]}>
            <boxGeometry args={[0.27, 0.025, 0.08]} />
            <primitive object={steel} attach="material" />
          </mesh>
        </group>
      ))}
      {stalls.map((stall) => (
        <group
          key={stall.tile}
          position={[stall.x, 0, stall.z]}
          rotation={[0, stall.side < 0 ? 0 : Math.PI, 0]}
        >
          {/* Stainless cart, counter and serving shelf. */}
          <mesh castShadow position={[0, 0.16, 0]}>
            <boxGeometry args={[0.19, 0.2, 0.15]} />
            <meshStandardMaterial color={stall.cart} roughness={0.48} metalness={0.3} />
          </mesh>
          <mesh castShadow position={[0, 0.28, 0.015]}>
            <boxGeometry args={[0.23, 0.035, 0.19]} />
            <primitive object={steel} attach="material" />
          </mesh>
          <mesh position={[0, 0.2, 0.096]}>
            <boxGeometry args={[0.12, 0.11, 0.008]} />
            <primitive object={charcoal} attach="material" />
          </mesh>
          {/* Striped canvas shade, poles and warm stall light. */}
          <mesh castShadow position={[0, 0.52, -0.015]} rotation={[0.03, 0, 0]}>
            <boxGeometry args={[0.3, 0.025, 0.24]} />
            <meshStandardMaterial color={stall.awning} roughness={0.9} />
          </mesh>
          {[-0.11, 0.11].map((x) => (
            <mesh key={x} position={[x, 0.4, -0.015]}>
              <cylinderGeometry args={[0.008, 0.01, 0.25, 8]} />
              <primitive object={steel} attach="material" />
            </mesh>
          ))}
          <mesh position={[0, 0.35, 0.075]}>
            <sphereGeometry args={[0.025, 10, 8]} />
            <meshStandardMaterial color="#ffcf79" emissive="#ff9e45" emissiveIntensity={1.3} />
          </mesh>
          {/* Plastic stools at the curb, the familiar Jalan Alor seating. */}
          {[-0.17, 0.17].map((x, k) => (
            <group key={x} position={[x, 0, 0.2]}>
              <mesh position={[0, 0.055, 0]}>
                <cylinderGeometry args={[0.045, 0.04, 0.06, 10]} />
                <meshStandardMaterial color={k ? "#207c74" : "#bc3930"} roughness={0.6} />
              </mesh>
              <mesh position={[0, 0.015, 0]}>
                <cylinderGeometry args={[0.028, 0.034, 0.03, 8]} />
                <primitive object={charcoal} attach="material" />
              </mesh>
            </group>
          ))}
          {/* Hanging red lanterns and the wire above the stall. */}
          {[-0.13, 0, 0.13].map((x) => (
            <group key={x} position={[x, 0.72, 0.05]}>
              <mesh position={[0, -0.06, 0]}>
                <sphereGeometry args={[0.035, 10, 8]} />
                <primitive object={lantern} attach="material" />
              </mesh>
              <mesh position={[0, -0.105, 0]}>
                <cylinderGeometry args={[0.003, 0.003, 0.035, 5]} />
                <meshStandardMaterial color="#d9a63d" metalness={0.45} roughness={0.45} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
    </group>
  );
}

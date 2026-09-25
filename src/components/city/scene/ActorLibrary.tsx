/**
 * The KL actor & effect library: local wildlife, festivals, street life and
 * urban mishaps that Claude can cast in an event. Each actor uses deterministic
 * procedural geometry, distinct surface maps and animated details.
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ActorKind } from "@/lib/city/types";
import { hash } from "./common";
import {
  AFTERMATH,
  Faller,
  Mat,
  Stomper,
  ease,
  useNormalMap,
  useSurfaceMap,
  type ActorProps,
} from "./actorParts";

type LibraryKind = Extract<
  ActorKind,
  | "tapir"
  | "hornbill"
  | "monitor_lizard"
  | "durian"
  | "grab_swarm"
  | "hot_air_balloon"
  | "lion_dance"
  | "procession"
  | "parade"
  | "festive_lights"
  | "haze"
  | "sinkhole"
  | "landslide"
  | "blackout"
  | "lrt_breakdown"
>;

/** Seconds after start when each library actor makes contact. */
export const LIBRARY_IMPACT: Record<LibraryKind, number> = {
  tapir: 4,
  hornbill: 3.2,
  monitor_lizard: 4,
  durian: 2.6,
  grab_swarm: 2.5,
  hot_air_balloon: 3.5,
  lion_dance: 3,
  procession: 3,
  parade: 3,
  festive_lights: 1.2,
  haze: 2,
  sinkhole: 1.2,
  landslide: 2,
  blackout: 1,
  lrt_breakdown: 1.2,
};

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpP = new THREE.Vector3();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

/** A unit direction for actors that walk through, varied per event. */
function useDir(seed: number, salt = 7) {
  return useMemo(() => {
    const ang = hash(seed, salt) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  }, [seed, salt]);
}

/** Seeded procedural detail so a replay shows the same actor every time. */
const detail = (seed: number, index: number, salt = 0) => hash(seed * 104729 + index, salt);
function detailDirection(seed: number, index: number, salt = 0) {
  const y = detail(seed, index, salt) * 2 - 1;
  const angle = detail(seed, index, salt + 1) * Math.PI * 2;
  const ring = Math.sqrt(1 - y * y);
  return new THREE.Vector3(Math.cos(angle) * ring, y, Math.sin(angle) * ring);
}

// ---------------------------------------------------------------------------
// Wildlife
// ---------------------------------------------------------------------------

/** Malayan tapir: black front and back, white saddle, long snout. */
function Tapir(p: ActorProps) {
  const legs = useRef<THREE.Group>(null);
  const torso = useRef<THREE.Group>(null);
  const head = useRef<THREE.Group>(null);
  const fur = useSurfaceMap("/textures/tapir-fur.webp");
  const furNormal = useNormalMap("/textures/tapir-fur.normal.webp");
  const saddle = useMemo(() => {
    const texture = fur.clone();
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 0.36);
    texture.offset.set(0, 0.32);
    texture.needsUpdate = true;
    return texture;
  }, [fur]);
  const saddleNormal = useMemo(() => {
    const texture = furNormal.clone();
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 0.36);
    texture.offset.set(0, 0.32);
    texture.needsUpdate = true;
    return texture;
  }, [furNormal]);
  useFrame(() => {
    const t = p.getT();
    if (torso.current) {
      torso.current.position.y = Math.sin(t * 2.4) * 0.018;
      torso.current.rotation.z = Math.sin(t * 3.5) * 0.025;
    }
    if (head.current) {
      head.current.rotation.y = Math.sin(t * 1.7) * 0.07;
      head.current.rotation.x = Math.sin(t * 2.6) * 0.035;
    }
    legs.current?.children.forEach(
      (l, i) => (l.rotation.x = Math.sin(t * 7 + (i % 2) * Math.PI) * 0.45),
    );
  });
  return (
    <Stomper {...p}>
      <group ref={torso}>
        <mesh castShadow position={[0, 0.7, 0.38]} scale={[0.5, 0.5, 0.45]}>
          <sphereGeometry args={[0.6, 20, 16]} />
          <Mat color="#1c1c1c" normalMap={furNormal} normalStrength={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.72, -0.05]} scale={[0.55, 0.55, 0.5]}>
          <sphereGeometry args={[0.6, 24, 18]} />
          <Mat
            color="#ffffff"
            map={saddle}
            normalMap={saddleNormal}
            normalStrength={0.25}
            roughness={0.95}
          />
        </mesh>
        <mesh castShadow position={[0, 0.7, -0.45]} scale={[0.5, 0.5, 0.45]}>
          <sphereGeometry args={[0.6, 20, 16]} />
          <Mat color="#1c1c1c" normalMap={furNormal} normalStrength={0.18} />
        </mesh>
      </group>
      <group ref={head}>
        <mesh castShadow position={[0, 0.78, 0.8]} scale={[0.32, 0.32, 0.36]}>
          <sphereGeometry args={[0.6, 20, 16]} />
          <Mat color="#1c1c1c" normalMap={furNormal} normalStrength={0.18} />
        </mesh>
        <mesh castShadow position={[0, 0.66, 1.05]} rotation={[1.2, 0, 0]}>
          <cylinderGeometry args={[0.05, 0.08, 0.3, 6]} />
          <Mat color="#1c1c1c" />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh
              castShadow
              position={[side * 0.16, 1.02, 0.62]}
              rotation={[0.15, 0, side * -0.24]}
            >
              <coneGeometry args={[0.1, 0.26, 10]} />
              <Mat color="#171918" />
            </mesh>
            <mesh position={[side * 0.25, 0.86, 0.76]}>
              <sphereGeometry args={[0.038, 12, 10]} />
              <Mat color="#090b0b" />
            </mesh>
            <mesh position={[side * 0.267, 0.872, 0.779]}>
              <sphereGeometry args={[0.01, 8, 6]} />
              <Mat color="#e4dfcf" />
            </mesh>
            <mesh position={[side * 0.055, 0.64, 1.18]} rotation={[1.2, 0, 0]}>
              <sphereGeometry args={[0.018, 8, 6]} />
              <Mat color="#070909" />
            </mesh>
          </group>
        ))}
      </group>
      <group ref={legs}>
        {[
          [-0.18, 0.4],
          [0.18, 0.4],
          [-0.18, -0.45],
          [0.18, -0.45],
        ].map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, 0.22, z]}>
            <capsuleGeometry args={[0.065, 0.28, 4, 10]} />
            <Mat color="#20211f" />
          </mesh>
        ))}
      </group>
    </Stomper>
  );
}

/** A giant monitor lizard (biawak) ambling out of the river. */
function MonitorLizard(p: ActorProps) {
  const body = useRef<THREE.Group>(null);
  const scales = useSurfaceMap("/textures/kaiju-scales.webp");
  const scaleNormal = useNormalMap("/textures/kaiju-scales.normal.webp");
  useFrame(() => {
    const t = p.getT();
    if (body.current) body.current.rotation.y = Math.sin(t * 5) * 0.18;
  });
  return (
    <Stomper {...p}>
      <group ref={body}>
        <mesh castShadow position={[0, 0.25, 0]} scale={[0.35, 0.22, 1]}>
          <sphereGeometry args={[0.6, 24, 16]} />
          <Mat
            color="#c4c99b"
            map={scales}
            normalMap={scaleNormal}
            normalStrength={0.35}
            roughness={0.88}
          />
        </mesh>
        <mesh castShadow position={[0, 0.3, 0.75]} scale={[0.18, 0.14, 0.32]}>
          <sphereGeometry args={[0.6, 18, 14]} />
          <Mat
            color="#c4c99b"
            map={scales}
            normalMap={scaleNormal}
            normalStrength={0.35}
            roughness={0.88}
          />
        </mesh>
        {[-1, 1].map((side) => (
          <group key={side}>
            <mesh position={[side * 0.15, 0.37, 0.8]}>
              <sphereGeometry args={[0.035, 10, 8]} />
              <Mat color="#d6b74c" />
            </mesh>
            <mesh position={[side * 0.16, 0.38, 0.826]}>
              <sphereGeometry args={[0.018, 10, 8]} />
              <Mat color="#10130f" />
            </mesh>
            <mesh position={[side * 0.045, 0.27, 1.03]}>
              <sphereGeometry args={[0.015, 8, 6]} />
              <Mat color="#181a16" />
            </mesh>
          </group>
        ))}
        <mesh position={[0, 0.28, 1]} rotation={[Math.PI / 2, 0, 0]}>
          <coneGeometry args={[0.02, 0.2, 4]} />
          <Mat color="#c0392b" />
        </mesh>
        <mesh castShadow position={[0, 0.2, -1]} rotation={[-Math.PI / 2 + 0.1, 0, 0]}>
          <coneGeometry args={[0.12, 1.1, 6]} />
          <Mat
            color="#bec595"
            map={scales}
            normalMap={scaleNormal}
            normalStrength={0.35}
            roughness={0.9}
          />
        </mesh>
        {Array.from({ length: 9 }, (_, k) => (
          <mesh key={k} position={[0, 0.42, 0.48 - k * 0.12]} scale={[0.065, 0.035, 0.055]}>
            <sphereGeometry args={[1, 10, 8]} />
            <Mat color={k % 2 ? "#b6b67b" : "#d2c47b"} />
          </mesh>
        ))}
        {[
          [-0.26, 0.35],
          [0.26, 0.35],
          [-0.26, -0.3],
          [0.26, -0.3],
        ].map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, 0.1, z]} rotation={[0, 0, x > 0 ? -0.8 : 0.8]}>
            <capsuleGeometry args={[0.045, 0.17, 4, 8]} />
            <Mat
              color="#bfc696"
              map={scales}
              normalMap={scaleNormal}
              normalStrength={0.35}
              roughness={0.9}
            />
          </mesh>
        ))}
      </group>
    </Stomper>
  );
}

/** Rhinoceros hornbill: circles the skyline, then swoops down. */
function Hornbill({ a, focus, getT, impact }: ActorProps) {
  const ref = useRef<THREE.Group>(null);
  const wings = useRef<THREE.Group>(null);
  const tail = useRef<THREE.Group>(null);
  const feathers = useSurfaceMap("/textures/hornbill-feather.webp");
  const featherNormal = useNormalMap("/textures/hornbill-feather.normal.webp");
  const s = 0.6 + a.size * 0.25;
  useFrame(() => {
    const t = getT();
    const g = ref.current;
    if (!g) return;
    const r = t < impact ? 8 * (1 - t / impact) + 1.2 : 1.2 + (t - impact) * 1.5;
    const ang = t * 1.2;
    const y = t < impact ? 7 - 4 * ease(t / impact) : 3 + (t - impact) * 0.8;
    g.position.set(focus.x + Math.cos(ang) * r, y, focus.z + Math.sin(ang) * r);
    g.rotation.y = -ang;
    g.rotation.z = Math.sin(t * 1.2) * 0.12;
    g.rotation.x = t < impact ? -0.12 * (1 - t / impact) : Math.sin(t * 1.4) * 0.04;
    g.scale.setScalar(s);
    wings.current?.children.forEach((w, i) => {
      w.rotation.z = (i ? -1 : 1) * (0.15 + Math.sin(t * 9) * 0.52);
      w.rotation.x = Math.sin(t * 9 + 0.8) * 0.08;
    });
    tail.current?.children.forEach((feather, i) => {
      const spread = (i - 1.5) * 0.08;
      feather.rotation.y = spread + Math.sin(t * 3) * 0.03;
    });
  });
  return (
    <group ref={ref}>
      <mesh castShadow scale={[0.25, 0.25, 0.6]}>
        <sphereGeometry args={[0.6, 24, 18]} />
        <Mat
          color="#ffffff"
          map={feathers}
          normalMap={featherNormal}
          normalStrength={0.2}
          roughness={0.52}
          metalness={0.04}
        />
      </mesh>
      <mesh castShadow position={[0, 0.09, 0.29]} scale={[0.2, 0.19, 0.2]}>
        <sphereGeometry args={[0.6, 20, 16]} />
        <Mat
          color="#ffffff"
          map={feathers}
          normalMap={featherNormal}
          normalStrength={0.2}
          roughness={0.5}
          metalness={0.04}
        />
      </mesh>
      <mesh position={[0, 0.05, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.095, 0.42, 10]} />
        <Mat color="#f1c33c" roughness={0.34} />
      </mesh>
      <mesh castShadow position={[0, 0.2, 0.43]} rotation={[0.08, 0, 0]} scale={[0.12, 0.14, 0.27]}>
        <sphereGeometry args={[1, 18, 12]} />
        <Mat color="#dc4b29" roughness={0.36} />
      </mesh>
      {[-1, 1].map((side) => (
        <group key={side}>
          <mesh position={[side * 0.17, 0.11, 0.3]}>
            <sphereGeometry args={[0.075, 14, 10]} />
            <Mat color="#e6ba35" roughness={0.38} />
          </mesh>
          <mesh position={[side * 0.19, 0.115, 0.34]}>
            <sphereGeometry args={[0.04, 12, 10]} />
            <Mat color="#080a0b" />
          </mesh>
          <mesh position={[side * 0.195, 0.13, 0.37]}>
            <sphereGeometry args={[0.011, 8, 6]} />
            <Mat color="#ffffff" />
          </mesh>
          <mesh castShadow position={[side * 0.075, -0.28, 0.05]} rotation={[0, 0, side * -0.08]}>
            <cylinderGeometry args={[0.018, 0.022, 0.18, 8]} />
            <Mat color="#e6ba35" />
          </mesh>
          <mesh position={[side * 0.075, -0.37, 0.12]}>
            <boxGeometry args={[0.12, 0.025, 0.09]} />
            <Mat color="#e6ba35" />
          </mesh>
        </group>
      ))}
      <group ref={tail}>
        {[-0.12, -0.04, 0.04, 0.12].map((x) => (
          <mesh key={x} castShadow position={[x, -0.05, -0.58]} rotation={[0, 0, x * 1.5]}>
            <boxGeometry args={[0.035, 0.018, 0.28]} />
            <Mat color={x === 0 ? "#17191a" : "#f1efe7"} />
          </mesh>
        ))}
      </group>
      <group ref={wings}>
        {[-1, 1].map((sgn) => (
          <group key={sgn} position={[sgn * 0.12, 0.04, -0.02]}>
            <mesh castShadow position={[sgn * 0.34, 0, 0]} scale={[1, 0.08, 1]}>
              <sphereGeometry args={[0.35, 18, 12]} />
              <Mat
                color="#ffffff"
                map={feathers}
                normalMap={featherNormal}
                normalStrength={0.25}
                roughness={0.52}
                metalness={0.04}
              />
            </mesh>
            {Array.from({ length: 6 }, (_, k) => (
              <mesh
                key={k}
                castShadow
                position={[sgn * (0.22 + k * 0.11), -0.015, -0.08 - k * 0.025]}
                rotation={[0.02, 0, sgn * 0.05]}
                scale={[1, 0.08, 1]}
              >
                <sphereGeometry args={[0.14, 12, 8]} />
                <Mat
                  color="#ffffff"
                  map={feathers}
                  normalMap={featherNormal}
                  normalStrength={0.25}
                  roughness={0.54}
                />
              </mesh>
            ))}
          </group>
        ))}
      </group>
    </group>
  );
}

/** A giant durian: falls, thuds, and splits open. */
function Durian(p: ActorProps) {
  const halves = useRef<THREE.Group>(null);
  const pulp = useRef<THREE.InstancedMesh>(null);
  const rind = useSurfaceMap("/textures/durian-rind.webp");
  const rindNormal = useNormalMap("/textures/durian-rind.normal.webp");
  const droplets = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        angle: detail(p.seed, i, 241) * Math.PI * 2,
        speed: 0.35 + detail(p.seed, i, 251) * 0.65,
        lift: 0.7 + detail(p.seed, i, 257) * 0.65,
        delay: detail(p.seed, i, 263) * 0.28,
        size: 0.012 + detail(p.seed, i, 269) * 0.018,
      })),
    [p.seed],
  );
  useFrame(() => {
    const since = p.getT() - p.impact;
    const open = since > 0.3 ? Math.min(0.78, (since - 0.3) * 1.1) : 0;
    const wobble =
      since > 0.3 ? Math.exp(-(since - 0.3) * 2.4) * Math.sin((since - 0.3) * 18) * 0.11 : 0;
    halves.current?.children.forEach((h, i) => {
      const side = i ? 1 : -1;
      h.rotation.z = side * (open + wobble);
      h.position.x = side * (0.02 + open * 0.12);
    });
    const m = pulp.current;
    if (!m) return;
    droplets.forEach((drop, i) => {
      const t = since - 0.35 - drop.delay;
      const y = 0.18 + drop.lift * t - 0.75 * t * t;
      if (t < 0 || t > 2.4 || y < 0) {
        m.setMatrixAt(i, HIDDEN);
        return;
      }
      tmpP.set(Math.cos(drop.angle) * drop.speed * t, y, Math.sin(drop.angle) * drop.speed * t);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.setScalar(drop.size * (1 - t / 2.4)));
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const spikes = useMemo(
    () =>
      Array.from({ length: 42 }, (_, k) => {
        const v = detailDirection(p.seed, k, 23);
        return {
          v,
          q: new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), v),
          k,
        };
      }),
    [p.seed],
  );
  return (
    <Faller {...p}>
      <group ref={halves}>
        {[-1, 1].map((side) => (
          <group key={side} position={[side * 0.02, -0.5, 0]}>
            <group position={[0, 0.5, 0]}>
              <mesh castShadow>
                <sphereGeometry args={[0.5, 24, 18, side > 0 ? 0 : Math.PI, Math.PI]} />
                <Mat
                  color="#ffffff"
                  map={rind}
                  normalMap={rindNormal}
                  normalStrength={0.55}
                  roughness={0.92}
                />
              </mesh>
              {spikes
                .filter((sp) => (side > 0 ? sp.v.x >= 0 : sp.v.x < 0))
                .map((sp) => (
                  <mesh key={sp.k} position={sp.v.clone().multiplyScalar(0.5)} quaternion={sp.q}>
                    <coneGeometry args={[0.055, 0.18, 6]} />
                    <Mat color={sp.k % 6 === 0 ? "#b6a344" : "#707a2f"} roughness={0.9} />
                  </mesh>
                ))}
              <mesh position={[side * 0.05, 0, 0]} scale={[0.2, 0.7, 0.7]}>
                <sphereGeometry args={[0.45, 8, 6]} />
                <Mat color="#f5d66a" />
              </mesh>
            </group>
          </group>
        ))}
      </group>
      <instancedMesh
        ref={pulp}
        args={[undefined, undefined, droplets.length]}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color="#f7cf71" roughness={0.28} transparent opacity={0.8} />
      </instancedMesh>
    </Faller>
  );
}

// ---------------------------------------------------------------------------
// Street life and festivals
// ---------------------------------------------------------------------------

/** A swarm of Grab riders converging on the scene. */
function GrabSwarm({ a, focus, getT, bus }: ActorProps) {
  const sent = useRef(false);
  useFrame(() => {
    if (sent.current || getT() < 0.3) return;
    sent.current = true;
    bus.spawns.push({
      color: "#00b14f",
      count: Math.min(24, Math.max(6, Math.round(a.count))),
      size: 0.6,
      flashing: false,
      x: focus.x,
      z: focus.z,
      until: bus.now + AFTERMATH + 6,
    });
  });
  return null;
}

/** A striped hot-air balloon drifting in over the towers. */
function HotAirBalloon({ a, focus, getT, impact, seed }: ActorProps) {
  const ref = useRef<THREE.Group>(null);
  const dir = useDir(seed, 11);
  const s = 0.6 + a.size * 0.2;
  useFrame(() => {
    const t = getT();
    const g = ref.current;
    if (!g) return;
    const off = t < impact ? 14 * (1 - t / impact) : -(t - impact) * 1.2;
    g.position.set(focus.x + dir.x * off, 3.5 + s + Math.sin(t) * 0.15, focus.z + dir.z * off);
    g.rotation.y = t * 0.2;
    g.scale.setScalar(s);
  });
  const stripes = [a.color || "#e84a3c", "#f7d154", "#3aa0e8", "#ffffff"];
  return (
    <group ref={ref}>
      {Array.from({ length: 8 }, (_, k) => (
        <mesh key={k} castShadow rotation={[0, (k / 8) * Math.PI * 2, 0]}>
          <sphereGeometry args={[0.9, 6, 10, 0, Math.PI / 4, 0, Math.PI * 0.8]} />
          <Mat color={stripes[k % stripes.length]} />
        </mesh>
      ))}
      <mesh position={[0, -1.3, 0]}>
        <boxGeometry args={[0.3, 0.2, 0.3]} />
        <Mat color="#8a5a2b" />
      </mesh>
      {[-0.12, 0.12].map((x) => (
        <mesh key={x} position={[x, -1, 0]}>
          <cylinderGeometry args={[0.005, 0.005, 0.55, 3]} />
          <Mat color="#333333" />
        </mesh>
      ))}
    </group>
  );
}

/** Two lions dancing up the street, with firecrackers. */
function LionDance({ a, focus, getT, impact, seed }: ActorProps) {
  const lions = useRef<THREE.Group>(null);
  const sparks = useRef<THREE.InstancedMesh>(null);
  const dir = useDir(seed, 13);
  const s = 0.5 + a.size * 0.12;
  const pops = useMemo(
    () =>
      Array.from({ length: 40 }, (_, k) => ({
        v: detailDirection(seed, k, 31),
        at: detail(seed, k, 37) * 6,
      })),
    [seed],
  );
  useFrame(() => {
    const t = getT();
    const off = t < impact ? 6 * (1 - t / impact) : 0;
    lions.current?.children.forEach((l, i) => {
      const side = i ? 0.8 : -0.8;
      l.position.set(
        focus.x + dir.x * off + dir.z * side,
        Math.abs(Math.sin(t * 6 + i)) * 0.35 * s,
        focus.z + dir.z * off - dir.x * side,
      );
      l.rotation.y = Math.atan2(-dir.x, -dir.z) + Math.sin(t * 3 + i) * 0.4;
      l.scale.setScalar(s);
    });
    const m = sparks.current;
    if (!m) return;
    pops.forEach((pp, k) => {
      const lt = (t - impact - pp.at * 0.3) % 1.2;
      if (t < impact || lt < 0 || lt > 0.5) {
        m.setMatrixAt(k, HIDDEN);
        return;
      }
      tmpP.set(
        focus.x + pp.v.x * lt * 1.5,
        0.2 + Math.abs(pp.v.y) * lt,
        focus.z + pp.v.z * lt * 1.5,
      );
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.setScalar(1 - lt * 1.6));
      m.setMatrixAt(k, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const colors = [a.color || "#d7263d", "#f4c430"];
  return (
    <>
      <group ref={lions}>
        {colors.map((c) => (
          <group key={c}>
            <mesh castShadow position={[0, 0.55, 0.35]}>
              <boxGeometry args={[0.5, 0.45, 0.45]} />
              <Mat color={c} />
            </mesh>
            {[-0.13, 0.13].map((x) => (
              <mesh key={x} position={[x, 0.68, 0.59]}>
                <sphereGeometry args={[0.08, 8, 6]} />
                <Mat color="#ffffff" />
              </mesh>
            ))}
            <mesh position={[0, 0.84, 0.35]}>
              <coneGeometry args={[0.08, 0.16, 5]} />
              <Mat color="#ffffff" />
            </mesh>
            <mesh castShadow position={[0, 0.45, -0.2]} scale={[1, 0.6, 1.6]}>
              <sphereGeometry args={[0.28, 8, 6]} />
              <Mat color={c} />
            </mesh>
            {[-0.12, 0.12].map((x) => (
              <mesh key={`l${x}`} position={[x, 0.15, 0.1]}>
                <cylinderGeometry args={[0.035, 0.035, 0.3, 5]} />
                <Mat color="#f4f1e8" />
              </mesh>
            ))}
          </group>
        ))}
      </group>
      <instancedMesh ref={sparks} args={[undefined, undefined, pops.length]} frustumCulled={false}>
        <sphereGeometry args={[0.04, 4, 3]} />
        <meshBasicMaterial color="#ffdd55" />
      </instancedMesh>
    </>
  );
}

/**
 * A column of marchers moving through the focus: Thaipusam devotees with
 * kavadi arches behind a silver chariot, or a Merdeka parade with flags.
 */
function Column({
  a,
  focus,
  getT,
  impact,
  seed,
  festival,
}: ActorProps & { festival: "thaipusam" | "merdeka" }) {
  const people = useRef<THREE.InstancedMesh>(null);
  const extras = useRef<THREE.InstancedMesh>(null);
  const lead = useRef<THREE.Group>(null);
  const dir = useDir(seed, 17);
  const n = Math.min(40, Math.max(12, Math.round(a.count) || 24));
  const palette = useMemo(
    () =>
      festival === "thaipusam"
        ? ["#f4a300", "#ffcc33", "#e8742a"]
        : ["#cc0001", "#ffffff", "#010066", "#ffcc00"],
    [festival],
  );
  useFrame(() => {
    const t = getT();
    const head = -8 + (16 * t) / (impact + AFTERMATH);
    const perp = new THREE.Vector3(dir.z, 0, -dir.x);
    for (let k = 0; k < n; k++) {
      const row = Math.floor(k / 3);
      const col = (k % 3) - 1;
      const d = head - row * 0.35;
      tmpP.set(
        focus.x + dir.x * d + perp.x * col * 0.25,
        0.1 + Math.abs(Math.sin(t * 5 + k)) * 0.03,
        focus.z + dir.z * d + perp.z * col * 0.25,
      );
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.setScalar(1.4));
      people.current?.setMatrixAt(k, tmpM);
      people.current?.setColorAt(k, new THREE.Color(palette[k % palette.length]));
      // Kavadi arches or flags above every other marcher.
      if (k % 2 === 0) {
        tmpP.y += festival === "thaipusam" ? 0.22 : 0.3;
        tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(dir.x, dir.z));
        tmpM.compose(tmpP, tmpQ, tmpS.setScalar(1));
        extras.current?.setMatrixAt(k / 2, tmpM);
      }
    }
    for (const m of [people.current, extras.current]) {
      if (!m) continue;
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
    }
    if (lead.current) {
      lead.current.position.set(focus.x + dir.x * (head + 0.8), 0, focus.z + dir.z * (head + 0.8));
      lead.current.rotation.y = Math.atan2(dir.x, dir.z);
    }
  });
  return (
    <>
      <instancedMesh ref={people} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
        <capsuleGeometry args={[0.03, 0.07, 2, 5]} />
        <meshStandardMaterial roughness={0.86} />
      </instancedMesh>
      <instancedMesh
        ref={extras}
        args={[undefined, undefined, Math.ceil(n / 2)]}
        frustumCulled={false}
      >
        {festival === "thaipusam" ? (
          <torusGeometry args={[0.1, 0.012, 4, 10, Math.PI]} />
        ) : (
          <boxGeometry args={[0.12, 0.07, 0.01]} />
        )}
        <meshStandardMaterial
          color={festival === "thaipusam" ? "#f7c948" : "#cc0001"}
          emissive={festival === "thaipusam" ? "#f7a000" : "#000000"}
          emissiveIntensity={0.3}
        />
      </instancedMesh>
      <group ref={lead}>
        {festival === "thaipusam" ? (
          <>
            <mesh castShadow position={[0, 0.25, 0]}>
              <boxGeometry args={[0.35, 0.35, 0.6]} />
              <Mat color="#c9ccd2" />
            </mesh>
            <mesh castShadow position={[0, 0.6, 0]}>
              <coneGeometry args={[0.22, 0.4, 6]} />
              <Mat color="#dfe2e8" />
            </mesh>
          </>
        ) : (
          <>
            <mesh castShadow position={[0, 0.2, 0]}>
              <boxGeometry args={[0.45, 0.3, 0.8]} />
              <Mat color="#010066" />
            </mesh>
            <mesh castShadow position={[0, 0.55, 0]}>
              <boxGeometry args={[0.5, 0.3, 0.02]} />
              <Mat color="#cc0001" />
            </mesh>
          </>
        )}
      </group>
    </>
  );
}

/** Lantern strings over the streets: red for Chinese New Year, green and gold for Raya. */
function FestiveLights({ a, focus, getT, impact }: ActorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const lanterns = useMemo(
    () =>
      Array.from({ length: 60 }, (_, k) => {
        const row = Math.floor(k / 10);
        return {
          x: focus.x - 2.5 + (k % 10) * 0.55,
          z: focus.z - 2.5 + row * 1,
          y: 0.9 + (row % 2) * 0.15,
          ph: k * 0.7,
        };
      }),
    [focus],
  );
  const color = a.color || "#d61f1f";
  useFrame(() => {
    const t = getT();
    const m = ref.current;
    if (!m) return;
    const on = ease((t - impact * 0.5) / 1.5);
    lanterns.forEach((l, k) => {
      const appear = ease(on * 1.4 - k / lanterns.length);
      tmpP.set(l.x, l.y + Math.sin(t * 2 + l.ph) * 0.03, l.z);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.set(appear, appear * 1.2, appear));
      m.setMatrixAt(k, appear > 0.01 && t < impact + AFTERMATH + 30 ? tmpM : HIDDEN);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, lanterns.length]} frustumCulled={false}>
      <sphereGeometry args={[0.07, 8, 6]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={1.1} />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Urban mishaps
// ---------------------------------------------------------------------------

/** Haze drifts in: the sky thickens and particles hang in the air. */
function Haze({ focus, getT, bus, seed }: ActorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  useEffect(() => {
    bus.hazeUntil = bus.now + AFTERMATH + 25;
  }, [bus]);
  const motes = useMemo(
    () =>
      Array.from({ length: 160 }, (_, k) => ({
        x: (detail(seed, k, 41) - 0.5) * 30,
        y: 0.5 + detail(seed, k, 43) * 6,
        z: (detail(seed, k, 47) - 0.5) * 30,
      })),
    [seed],
  );
  useFrame(() => {
    const t = getT();
    const m = ref.current;
    if (!m) return;
    const k = ease(t / 2);
    motes.forEach((d, i) => {
      tmpP.set(d.x + Math.sin(t * 0.3 + i) * 0.5 + focus.x * 0.1, d.y, d.z + t * 0.1);
      tmpM.compose(tmpP, tmpQ.identity(), tmpS.setScalar(k));
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, motes.length]} frustumCulled={false}>
      <icosahedronGeometry args={[0.35, 0]} />
      <meshBasicMaterial color="#b8a77e" transparent opacity={0.18} depthWrite={false} />
    </instancedMesh>
  );
}

/** The road caves in: a dark pit opens and debris tumbles in. */
function Sinkhole({ a, focus, getT, impact, seed }: ActorProps) {
  const pit = useRef<THREE.Mesh>(null);
  const bits = useRef<THREE.InstancedMesh>(null);
  const r = 0.5 + a.size * 0.18;
  const chunks = useMemo(
    () =>
      Array.from({ length: 24 }, (_, k) => ({
        a: detail(seed, k, 53) * Math.PI * 2,
        d: detail(seed, k, 59),
        s: 0.05 + detail(seed, k, 61) * 0.1,
      })),
    [seed],
  );
  useFrame(() => {
    const t = getT();
    const open = ease((t - impact * 0.6) / 1.2);
    pit.current?.scale.set(r * open + 0.001, 1, r * open + 0.001);
    const m = bits.current;
    if (!m) return;
    chunks.forEach((c, k) => {
      const lt = t - impact - c.d * 2;
      const rr = r * open * (0.4 + c.d * 0.6);
      const y = lt > 0 ? 0.05 - lt * lt * 2 : 0.05;
      tmpP.set(focus.x + Math.cos(c.a) * rr, y, focus.z + Math.sin(c.a) * rr);
      tmpM.compose(
        tmpP,
        tmpQ.setFromEuler(new THREE.Euler(lt, lt * 2, 0)),
        tmpS.setScalar(y > -1 ? c.s : 0),
      );
      m.setMatrixAt(k, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <mesh ref={pit} position={[focus.x, 0.03, focus.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1, 18]} />
        <meshBasicMaterial color="#0b0906" />
      </mesh>
      <instancedMesh ref={bits} args={[undefined, undefined, chunks.length]} frustumCulled={false}>
        <boxGeometry args={[1, 0.4, 1]} />
        <meshStandardMaterial color="#4a4a4e" roughness={0.92} />
      </instancedMesh>
    </>
  );
}

/** Mud and trees slide down the slope towards the focus. */
function Landslide({ a, focus, getT, impact, seed }: ActorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const dir = useDir(seed, 19);
  const clods = useMemo(
    () =>
      Array.from({ length: 40 }, (_, k) => ({
        side: (detail(seed, k, 67) - 0.5) * (1.5 + a.size * 0.3),
        lag: detail(seed, k, 71) * 1.2,
        s: 0.15 + detail(seed, k, 73) * 0.25,
        tree: detail(seed, k, 79) < 0.2,
      })),
    [a.size, seed],
  );
  useFrame(() => {
    const t = getT();
    const m = ref.current;
    if (!m) return;
    const perp = new THREE.Vector3(dir.z, 0, -dir.x);
    clods.forEach((c, k) => {
      const lt = Math.max(0, t - c.lag * 0.5);
      const d = 5 - Math.min(5.5, lt * (5 / impact));
      tmpP.set(
        focus.x + dir.x * d + perp.x * c.side,
        Math.max(0.05, d * 0.35) + c.s / 2,
        focus.z + dir.z * d + perp.z * c.side,
      );
      tmpM.compose(
        tmpP,
        tmpQ.setFromEuler(new THREE.Euler(lt * 2, lt, 0)),
        tmpS.set(c.s, c.s * 0.7, c.s),
      );
      m.setMatrixAt(k, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh
      ref={ref}
      args={[undefined, undefined, clods.length]}
      castShadow
      frustumCulled={false}
    >
      <dodecahedronGeometry args={[1, 0]} />
      <meshStandardMaterial color="#6b4a2b" roughness={0.94} />
    </instancedMesh>
  );
}

/** A substation blows: blue flash, sparks, and the lights go out. */
function Blackout({ focus, getT, impact, bus }: ActorProps) {
  const sparks = useRef<THREE.Group>(null);
  const fired = useRef(false);
  useFrame(() => {
    const t = getT();
    if (!fired.current && t >= impact) {
      fired.current = true;
      bus.blackoutUntil = bus.now + AFTERMATH + 20;
      bus.flash = 1;
    }
    sparks.current?.children.forEach((c, i) => {
      const on = t > impact && t < impact + 3 && Math.sin(t * 40 + i * 3) > 0.3;
      c.visible = on;
      c.position.set(
        Math.sin(i * 2.1) * 0.3,
        0.5 + Math.cos(i * 1.3) * 0.2,
        Math.cos(i * 2.1) * 0.3,
      );
    });
  });
  return (
    <group position={[focus.x, 0, focus.z]}>
      <mesh castShadow position={[0, 0.25, 0]}>
        <boxGeometry args={[0.5, 0.5, 0.4]} />
        <Mat color="#8b8f94" />
      </mesh>
      <group ref={sparks}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i}>
            <octahedronGeometry args={[0.06, 0]} />
            <meshBasicMaterial color="#9fe3ff" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Trains grind to a halt; smoke rises from the stalled car. */
function LrtBreakdown({ focus, getT, impact, bus }: ActorProps) {
  const smoke = useRef<THREE.Group>(null);
  const fired = useRef(false);
  useFrame(() => {
    const t = getT();
    if (!fired.current && t >= impact) {
      fired.current = true;
      bus.railStopUntil = bus.now + AFTERMATH + 15;
    }
    smoke.current?.children.forEach((c, i) => {
      const k = (((t * 0.4 + i * 0.2) % 1) + 1) % 1;
      c.position.set(Math.sin(i) * 0.2, 1.3 + k * 2, Math.cos(i) * 0.2);
      c.scale.setScalar(0.3 + k * 0.8);
      ((c as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity =
        t > impact ? 0.5 * (1 - k) : 0;
    });
  });
  return (
    <group ref={smoke} position={[focus.x, 0, focus.z]}>
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={i}>
          <icosahedronGeometry args={[0.3, 0]} />
          <meshBasicMaterial color="#555555" transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export const ACTOR_LIBRARY: Record<LibraryKind, (p: ActorProps) => React.ReactNode> = {
  tapir: Tapir,
  hornbill: Hornbill,
  monitor_lizard: MonitorLizard,
  durian: Durian,
  grab_swarm: GrabSwarm,
  hot_air_balloon: HotAirBalloon,
  lion_dance: LionDance,
  procession: (p) => <Column {...p} festival="thaipusam" />,
  parade: (p) => <Column {...p} festival="merdeka" />,
  festive_lights: FestiveLights,
  haze: Haze,
  sinkhole: Sinkhole,
  landslide: Landslide,
  blackout: Blackout,
  lrt_breakdown: LrtBreakdown,
};

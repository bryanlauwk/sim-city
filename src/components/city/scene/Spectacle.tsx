import { Suspense, useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type {
  Actor,
  ActorKind,
  ActorShape,
  CrowdReaction,
  Recipe,
  RecipeShape,
  Responder,
} from "@/lib/city/types";
import { hash, type WorldBus } from "./common";

import {
  AFTERMATH,
  Faller,
  Mat,
  ShapeGeometry,
  Stomper,
  ease,
  type ActorProps,
} from "./actorParts";
import { ACTOR_LIBRARY, LIBRARY_IMPACT } from "./ActorLibrary";

export { AFTERMATH };
export interface SpectacleRun {
  id: number;
  actors: Actor[];
  crowd: CrowdReaction;
  responders: Responder[];
  focus: { x: number; z: number };
  radius: number;
}

/** Seconds after start when each kind of actor makes contact. */
const IMPACT_AT: Record<ActorKind, number> = {
  ...LIBRARY_IMPACT,
  whale: 2.6,
  meteor: 2.0,
  giant_object: 2.6,
  kaiju: 4.2,
  creature: 4.2,
  ufo: 3.0,
  tornado: 3.5,
  swarm: 3.0,
  convoy: 3.2,
  rain_of: 1.8,
  wave: 2.5,
  storm: 2.2,
  fireworks: 1.2,
};
export const impactTime = (actors: Actor[]) => (actors.length ? IMPACT_AT[actors[0].kind] : 0.4);

const RESPONDER_COLOR: Record<Responder, string> = {
  fire: "#c62f22",
  police: "#1d3f94",
  ambulance: "#f4f4f4",
  army: "#4b5a32",
  cleanup: "#e6801f",
};

// ---------------------------------------------------------------------------
// Falling things: whale and giant objects
// ---------------------------------------------------------------------------

function Whale(p: ActorProps) {
  const tail = useRef<THREE.Group>(null);
  useFrame(() => {
    if (tail.current) tail.current.rotation.x = Math.sin(p.getT() * 3) * 0.35;
  });
  const c = p.a.color;
  return (
    <Faller {...p}>
      <mesh castShadow scale={[0.55, 0.45, 1.1]}>
        <sphereGeometry args={[0.5, 14, 10]} />
        <Mat color={c} />
      </mesh>
      <mesh position={[0, -0.1, 0.05]} scale={[0.45, 0.3, 0.95]}>
        <sphereGeometry args={[0.5, 12, 8]} />
        <Mat color="#e8eef2" />
      </mesh>
      {[-1, 1].map((sgn) => (
        <group key={sgn}>
          <mesh position={[sgn * 0.28, -0.1, 0.2]} rotation={[0, sgn * 0.5, sgn * -0.5]}>
            <boxGeometry args={[0.4, 0.03, 0.18]} />
            <Mat color={c} />
          </mesh>
          <mesh position={[sgn * 0.2, 0.04, 0.42]}>
            <sphereGeometry args={[0.035, 6, 6]} />
            <Mat color="#111111" />
          </mesh>
        </group>
      ))}
      <group ref={tail} position={[0, 0, -0.5]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -0.25]}>
          <coneGeometry args={[0.16, 0.55, 8]} />
          <Mat color={c} />
        </mesh>
        <mesh position={[0, 0, -0.55]}>
          <boxGeometry args={[0.8, 0.04, 0.22]} />
          <Mat color={c} />
        </mesh>
      </group>
    </Faller>
  );
}

function GiantObject(p: ActorProps) {
  return (
    <Faller {...p}>
      <mesh castShadow>
        <ShapeGeometry shape={p.a.shape} />
        <Mat color={p.a.color} />
      </mesh>
    </Faller>
  );
}

// ---------------------------------------------------------------------------
// Meteor
// ---------------------------------------------------------------------------

function Meteor({ a, focus, getT, impact }: ActorProps) {
  const rock = useRef<THREE.Group>(null);
  const trail = useRef<THREE.Group>(null);
  const s = 0.25 + a.size * 0.15;
  const start = useMemo(() => new THREE.Vector3(focus.x - 16, 24, focus.z - 9), [focus]);
  const end = useMemo(() => new THREE.Vector3(focus.x, 0.3, focus.z), [focus]);
  useFrame(() => {
    const t = getT();
    const k = ease(t / impact);
    const pos = start.clone().lerp(end, k * k);
    if (rock.current) {
      rock.current.position.copy(pos);
      rock.current.rotation.set(t * 3, t * 2, 0);
      rock.current.visible = t < impact;
    }
    if (trail.current) {
      trail.current.visible = t < impact;
      trail.current.children.forEach((c, i) => {
        const kk = Math.max(0, k - (i + 1) * 0.025);
        c.position.copy(start.clone().lerp(end, kk * kk));
        c.scale.setScalar(s * (1 - i / 12));
      });
    }
  });
  return (
    <>
      <group ref={rock} scale={s}>
        <mesh>
          <icosahedronGeometry args={[1, 0]} />
          <Mat color="#4a3b33" emissive="#ff5a1f" />
        </mesh>
      </group>
      <group ref={trail}>
        {Array.from({ length: 10 }, (_, i) => (
          <mesh key={i}>
            <sphereGeometry args={[0.8, 8, 6]} />
            <meshBasicMaterial
              color={i < 3 ? "#ffe07a" : "#ff7a2a"}
              transparent
              opacity={0.5 - i * 0.04}
            />
          </mesh>
        ))}
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Walkers: kaiju and creatures stomp in from the edge and out the other side
// ---------------------------------------------------------------------------

function Kaiju(p: ActorProps) {
  const c = p.a.color;
  return (
    <Stomper {...p}>
      {[-0.2, 0.2].map((x) => (
        <mesh key={x} castShadow position={[x, 0.4, 0]}>
          <cylinderGeometry args={[0.12, 0.15, 0.8, 6]} />
          <Mat color={c} />
        </mesh>
      ))}
      <mesh castShadow position={[0, 1.15, 0]}>
        <capsuleGeometry args={[0.36, 0.6, 4, 8]} />
        <Mat color={c} />
      </mesh>
      <mesh castShadow position={[0, 1.85, 0.12]}>
        <sphereGeometry args={[0.28, 10, 8]} />
        <Mat color={c} />
      </mesh>
      {[-0.1, 0.1].map((x) => (
        <mesh key={x} position={[x, 1.9, 0.36]}>
          <sphereGeometry args={[0.05, 6, 6]} />
          <Mat color="#fff27a" emissive="#ffd000" />
        </mesh>
      ))}
      {[0.9, 1.2, 1.5].map((y) => (
        <mesh key={y} castShadow position={[0, y, -0.36]} rotation={[-0.6, 0, 0]}>
          <coneGeometry args={[0.1, 0.3, 4]} />
          <Mat color="#d9d4c3" />
        </mesh>
      ))}
      <mesh castShadow position={[0, 0.5, -0.6]} rotation={[-1.1, 0, 0]}>
        <coneGeometry args={[0.2, 1, 6]} />
        <Mat color={c} />
      </mesh>
    </Stomper>
  );
}

function Creature(p: ActorProps) {
  const legs = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = p.getT();
    legs.current?.children.forEach(
      (l, i) => (l.rotation.x = Math.sin(t * 9 + (i % 2) * Math.PI) * 0.5),
    );
  });
  const c = p.a.color;
  return (
    <Stomper {...p}>
      <mesh castShadow position={[0, 0.75, 0]}>
        <boxGeometry args={[0.6, 0.45, 1.1]} />
        <Mat color={c} />
      </mesh>
      <mesh castShadow position={[0, 1.05, 0.62]}>
        <boxGeometry args={[0.4, 0.38, 0.4]} />
        <Mat color={c} />
      </mesh>
      {[-0.13, 0.13].map((x) => (
        <mesh key={x} position={[x, 1.32, 0.62]}>
          <coneGeometry args={[0.07, 0.2, 4]} />
          <Mat color={c} />
        </mesh>
      ))}
      <group ref={legs}>
        {[
          [-0.22, 0.4],
          [0.22, 0.4],
          [-0.22, -0.4],
          [0.22, -0.4],
        ].map(([x, z], i) => (
          <mesh key={i} castShadow position={[x, 0.3, z]}>
            <cylinderGeometry args={[0.07, 0.07, 0.6, 5]} />
            <Mat color={c} />
          </mesh>
        ))}
      </group>
      <mesh position={[0, 0.9, -0.7]} rotation={[-0.8, 0, 0]}>
        <cylinderGeometry args={[0.04, 0.06, 0.6, 5]} />
        <Mat color={c} />
      </mesh>
    </Stomper>
  );
}

// ---------------------------------------------------------------------------
// UFO, tornado, wave, storm
// ---------------------------------------------------------------------------

function Ufo({ a, focus, getT, impact }: ActorProps) {
  const ref = useRef<THREE.Group>(null);
  const beam = useRef<THREE.Mesh>(null);
  const lights = useRef<THREE.Group>(null);
  const s = 0.5 + a.size * 0.25;
  const hover = 4 + s;
  useFrame(() => {
    const t = getT();
    const g = ref.current;
    if (!g) return;
    let y: number;
    if (t < impact) y = 20 - (20 - hover) * ease(t / impact);
    else if (t < impact + 6) y = hover + Math.sin(t * 2) * 0.2;
    else y = hover + (t - impact - 6) ** 2 * 6;
    g.position.set(focus.x + Math.sin(t * 1.3) * 0.3, y, focus.z + Math.cos(t) * 0.3);
    g.rotation.z = Math.sin(t * 2.2) * 0.08;
    if (lights.current) lights.current.rotation.y = t * 3;
    if (beam.current) {
      const on = t > impact - 0.3 && t < impact + 5.5;
      beam.current.visible = on;
      beam.current.scale.set(1, y, 1);
      beam.current.position.set(0, -y / 2, 0);
      (beam.current.material as THREE.MeshBasicMaterial).opacity = 0.25 + Math.sin(t * 8) * 0.08;
    }
  });
  return (
    <group ref={ref} scale={s}>
      <mesh castShadow scale={[1, 0.2, 1]}>
        <sphereGeometry args={[0.9, 16, 8]} />
        <Mat color={a.color} />
      </mesh>
      <mesh position={[0, 0.12, 0]}>
        <sphereGeometry args={[0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#9fe8ff" transparent opacity={0.7} />
      </mesh>
      <group ref={lights}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh
            key={i}
            position={[
              Math.cos((i / 8) * Math.PI * 2) * 0.8,
              -0.05,
              Math.sin((i / 8) * Math.PI * 2) * 0.8,
            ]}
          >
            <sphereGeometry args={[0.06, 6, 6]} />
            <Mat color="#fffb9a" emissive="#fff27a" />
          </mesh>
        ))}
      </group>
      <mesh ref={beam}>
        <cylinderGeometry args={[0.25, 1.4, 1, 16, 1, true]} />
        <meshBasicMaterial
          color="#b6ffcf"
          transparent
          opacity={0.3}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function Tornado({ a, focus, getT, impact, seed }: ActorProps) {
  const ref = useRef<THREE.Group>(null);
  const s = 0.4 + a.size * 0.2;
  const dir = useMemo(() => {
    const ang = hash(seed, 3) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang));
  }, [seed]);
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = getT();
    const total = impact + AFTERMATH * 0.7;
    const off = 12 - (24 * t) / (impact * 2);
    g.position.set(focus.x + dir.x * off, 0, focus.z + dir.z * off);
    g.visible = t < total;
    g.children.forEach((c, i) => {
      c.rotation.y = t * (6 + i * 0.4);
      c.position.x = Math.sin(t * 3 + i * 0.6) * 0.15 * i * 0.3;
    });
  });
  return (
    <group ref={ref} scale={s}>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i} position={[0, i * 0.38 + 0.1, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[0.15 + i * 0.13, 0.07 + i * 0.01, 5, 12]} />
          <meshStandardMaterial color={a.color} transparent opacity={0.55} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Wave({ a, focus, getT, impact }: ActorProps) {
  const ref = useRef<THREE.Group>(null);
  const h = 0.3 + a.size * 0.18;
  useFrame(() => {
    const g = ref.current;
    if (!g) return;
    const t = getT();
    const x = focus.x - 18 + (18 * t) / impact;
    g.position.set(x, h / 2, 0);
    g.visible = x < 20;
    g.scale.y = 1 + Math.sin(t * 5) * 0.08;
  });
  return (
    <group ref={ref}>
      <mesh>
        <boxGeometry args={[1.6, h, 34]} />
        <meshStandardMaterial color={a.color} transparent opacity={0.7} />
      </mesh>
      <mesh position={[0.3, h / 2, 0]}>
        <boxGeometry args={[1, 0.08, 34]} />
        <meshStandardMaterial color="#f2f7fa" />
      </mesh>
    </group>
  );
}

function Storm({ focus, getT, impact, bus }: ActorProps) {
  const clouds = useRef<THREE.Group>(null);
  const bolt = useRef<THREE.Group>(null);
  const nextBolt = useRef(0);
  useEffect(() => {
    bus.stormUntil = bus.now + impact + AFTERMATH + 4;
  }, [bus, impact]);
  useFrame(() => {
    const t = getT();
    const k = ease(t / impact);
    clouds.current?.children.forEach((c, i) => {
      const ang = (i / 7) * Math.PI * 2 + t * 0.1;
      const r = 9 - 6 * k;
      c.position.set(focus.x + Math.cos(ang) * r, 7, focus.z + Math.sin(ang) * r);
    });
    const b = bolt.current;
    if (!b) return;
    if (t > impact - 0.4 && t > nextBolt.current) {
      nextBolt.current = t + 0.5 + Math.random() * 0.8;
      b.position.set(focus.x + (Math.random() - 0.5) * 5, 0, focus.z + (Math.random() - 0.5) * 5);
      b.userData.until = t + 0.15;
      bus.flash = 1;
      bus.shake = Math.max(bus.shake, 0.05);
    }
    b.visible = t < (b.userData.until ?? 0);
  });
  return (
    <>
      <group ref={clouds}>
        {Array.from({ length: 7 }, (_, i) => (
          <mesh key={i} scale={[3, 1, 2.2]}>
            <dodecahedronGeometry args={[1, 0]} />
            <meshStandardMaterial color="#4a525c" flatShading />
          </mesh>
        ))}
      </group>
      <group ref={bolt} visible={false}>
        {[
          [0, 5.5, 0, 0.3],
          [0.4, 3.5, 0.2, -0.4],
          [0.1, 1.4, -0.1, 0.3],
        ].map(([x, y, z, r], i) => (
          <mesh key={i} position={[x, y, z]} rotation={[0, 0, r]}>
            <cylinderGeometry args={[0.04, 0.04, 2.3, 4]} />
            <meshBasicMaterial color="#fffbe0" />
          </mesh>
        ))}
      </group>
    </>
  );
}

// ---------------------------------------------------------------------------
// Instanced crowds of things: swarm, rain of objects, fireworks
// ---------------------------------------------------------------------------

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpC = new THREE.Color();
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

function Swarm({ a, focus, getT, impact, seed }: ActorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.round(a.count);
  const s = 0.1 + a.size * 0.03;
  const boids = useMemo(() => {
    const ang = hash(seed, 5) * Math.PI * 2;
    const ox = focus.x + Math.cos(ang) * 17;
    const oz = focus.z + Math.sin(ang) * 17;
    return Array.from({ length: n }, () => ({
      p: new THREE.Vector3(
        ox + (Math.random() - 0.5) * 3,
        2 + Math.random() * 3,
        oz + (Math.random() - 0.5) * 3,
      ),
      v: new THREE.Vector3(),
      o: Math.random() * 10,
    }));
  }, [n, focus, seed]);
  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const t = getT();
    const m = ref.current;
    if (!m) return;
    const leaving = t > impact + AFTERMATH - 2;
    boids.forEach((b, i) => {
      const goal = new THREE.Vector3(
        focus.x + Math.cos(t * 1.5 + b.o) * (t > impact ? 1.5 + (i % 5) * 0.3 : 0),
        1 + (i % 7) * 0.35 + Math.sin(t * 3 + b.o) * 0.3,
        focus.z + Math.sin(t * 1.5 + b.o) * (t > impact ? 1.5 + (i % 5) * 0.3 : 0),
      );
      if (leaving) goal.set(b.p.x * 3, 8, b.p.z * 3);
      const steer = goal.sub(b.p).multiplyScalar(1.4);
      b.v.addScaledVector(steer, dt).multiplyScalar(0.97);
      const sp = b.v.length();
      if (sp > 7) b.v.multiplyScalar(7 / sp);
      b.p.addScaledVector(b.v, dt);
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), b.v.clone().normalize());
      tmpM.compose(b.p, tmpQ, tmpS.set(s, s, s));
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
      <ShapeGeometry shape={a.shape === "blob" ? "cone" : a.shape} />
      <Mat color={a.color} />
    </instancedMesh>
  );
}

function RainOf({ a, focus, getT, radius }: ActorProps & { radius: number }) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const n = Math.round(a.count);
  const s = 0.12 + a.size * 0.05;
  const items = useMemo(
    () =>
      Array.from({ length: n }, () => {
        const r = Math.sqrt(Math.random()) * (radius + 1.5);
        const ang = Math.random() * Math.PI * 2;
        return {
          x: focus.x + Math.cos(ang) * r,
          z: focus.z + Math.sin(ang) * r,
          delay: Math.random() * 2.4,
          spin: Math.random() * 6,
        };
      }),
    [n, focus, radius],
  );
  useFrame(() => {
    const t = getT();
    const m = ref.current;
    if (!m) return;
    items.forEach((it, i) => {
      const lt = t - it.delay;
      if (lt < 0) {
        m.setMatrixAt(i, HIDDEN);
        return;
      }
      const y = Math.max(s * 0.5, 14 - lt * lt * 9);
      const landed = y <= s * 0.5;
      const fade = Math.max(0, Math.min(1, (AFTERMATH + 2 - lt) / 2));
      tmpQ.setFromEuler(new THREE.Euler(landed ? 0.3 : lt * it.spin, lt * it.spin, 0));
      tmpM.compose(new THREE.Vector3(it.x, y, it.z), tmpQ, tmpS.setScalar(s * fade));
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, n]} castShadow frustumCulled={false}>
      <ShapeGeometry shape={a.shape} />
      <Mat color={a.color} />
    </instancedMesh>
  );
}

function Fireworks({ a, focus, getT }: ActorProps) {
  const ref = useRef<THREE.InstancedMesh>(null);
  const BURSTS = 8;
  const PER = 36;
  const bursts = useMemo(
    () =>
      Array.from({ length: BURSTS }, (_, b) => ({
        at: 0.4 + b * 0.9,
        x: focus.x + (Math.random() - 0.5) * 6,
        y: 6 + Math.random() * 3,
        z: focus.z + (Math.random() - 0.5) * 6,
        hue:
          b % 2 && a.color
            ? new THREE.Color(a.color).getHSL({ h: 0, s: 0, l: 0 }).h
            : Math.random(),
        dirs: Array.from({ length: PER }, () => new THREE.Vector3().randomDirection()),
      })),
    [focus, a.color],
  );
  useFrame(() => {
    const t = getT();
    const m = ref.current;
    if (!m) return;
    let k = 0;
    for (const b of bursts) {
      const lt = t - b.at;
      for (const d of b.dirs) {
        if (lt < 0 || lt > 1.8) m.setMatrixAt(k, HIDDEN);
        else {
          const r = lt * 2.2;
          tmpM.makeTranslation(b.x + d.x * r, b.y + d.y * r - lt * lt * 0.8, b.z + d.z * r);
          m.setMatrixAt(
            k,
            tmpM.multiply(new THREE.Matrix4().makeScale(1 - lt / 1.8, 1 - lt / 1.8, 1 - lt / 1.8)),
          );
          m.setColorAt(k, tmpC.setHSL(b.hue, 1, 0.6));
        }
        k++;
      }
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, BURSTS * PER]} frustumCulled={false}>
      <sphereGeometry args={[0.07, 5, 4]} />
      <meshBasicMaterial />
    </instancedMesh>
  );
}

// ---------------------------------------------------------------------------
// Impact: dust ring and flying debris
// ---------------------------------------------------------------------------

function ImpactBurst({
  focus,
  getT,
  impact,
  size,
  color,
}: {
  focus: { x: number; z: number };
  getT: () => number;
  impact: number;
  size: number;
  color: string;
}) {
  const ring = useRef<THREE.Mesh>(null);
  const debris = useRef<THREE.InstancedMesh>(null);
  const parts = useMemo(
    () =>
      Array.from({ length: 28 }, () => ({
        v: new THREE.Vector3(
          (Math.random() - 0.5) * 6,
          3 + Math.random() * 5,
          (Math.random() - 0.5) * 6,
        ).multiplyScalar(0.4 + size * 0.1),
        r: Math.random() * 6,
      })),
    [size],
  );
  useFrame(() => {
    const lt = getT() - impact;
    if (ring.current) {
      ring.current.visible = lt > 0 && lt < 1.6;
      ring.current.scale.setScalar(0.5 + lt * (2 + size));
      (ring.current.material as THREE.MeshBasicMaterial).opacity = Math.max(
        0,
        0.6 * (1 - lt / 1.6),
      );
    }
    const m = debris.current;
    if (!m) return;
    parts.forEach((p, i) => {
      if (lt < 0 || lt > 2.5) {
        m.setMatrixAt(i, HIDDEN);
        return;
      }
      const y = Math.max(0.05, p.v.y * lt - 4.9 * lt * lt);
      tmpQ.setFromEuler(new THREE.Euler(lt * p.r, lt * p.r, 0));
      tmpM.compose(
        new THREE.Vector3(focus.x + p.v.x * lt, y, focus.z + p.v.z * lt),
        tmpQ,
        tmpS.setScalar(0.12),
      );
      m.setMatrixAt(i, tmpM);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <mesh ref={ring} position={[focus.x, 0.1, focus.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.8, 1, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.6} side={THREE.DoubleSide} />
      </mesh>
      <instancedMesh ref={debris} args={[undefined, undefined, parts.length]} frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#8d7f6d" flatShading />
      </instancedMesh>
    </>
  );
}

// ---------------------------------------------------------------------------
// Custom actors from the shared library: a ready-made Poly Pizza model, or
// Claude's own recipe of primitives. Both move like their built-in stand-in.
// ---------------------------------------------------------------------------

const WALKERS = new Set<ActorKind>(["kaiju", "creature", "tapir", "monitor_lizard", "lion_dance"]);
const FLYERS = new Set<ActorKind>([
  "ufo",
  "hornbill",
  "hot_air_balloon",
  "swarm",
  "storm",
  "fireworks",
]);

/** Scale an object to a 1.2-unit footprint, resting on the ground. */
function normalise(o: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(o);
  const size = box.getSize(new THREE.Vector3());
  const k = 1.2 / Math.max(size.x, size.y, size.z, 0.001);
  const centre = box.getCenter(new THREE.Vector3());
  o.scale.setScalar(k);
  o.position.set(-centre.x * k, -box.min.y * k, -centre.z * k);
}

/** A ready-made model keeps its own colours; it just learns to cast shadows. */
function ModelMesh({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const object = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) m.castShadow = true;
    });
    normalise(o);
    return o;
  }, [scene]);
  return <primitive object={object} />;
}

const RECIPE_GEOMETRY: Record<RecipeShape, () => THREE.BufferGeometry> = {
  box: () => new THREE.BoxGeometry(1, 1, 1),
  sphere: () => new THREE.SphereGeometry(0.5, 12, 8),
  cylinder: () => new THREE.CylinderGeometry(0.5, 0.5, 1, 12),
  cone: () => new THREE.ConeGeometry(0.5, 1, 12),
  torus: () => new THREE.TorusGeometry(0.4, 0.1, 8, 20),
  capsule: () => new THREE.CapsuleGeometry(0.5, 1, 4, 10).scale(1, 0.5, 1),
};

/** Claude's design, built from primitives in the city's flat-shaded style. */
function RecipeMesh({ recipe }: { recipe: Recipe }) {
  const object = useMemo(() => {
    const root = new THREE.Group();
    const inner = new THREE.Group();
    root.add(inner);
    const geos = new Map<RecipeShape, THREE.BufferGeometry>();
    const mats = new Map<string, THREE.Material>();
    const d = THREE.MathUtils.degToRad;
    for (const p of recipe.parts) {
      if (!geos.has(p.shape)) geos.set(p.shape, RECIPE_GEOMETRY[p.shape]());
      if (!mats.has(p.color))
        mats.set(
          p.color,
          new THREE.MeshStandardMaterial({ color: p.color, flatShading: true, roughness: 0.7 }),
        );
      const m = new THREE.Mesh(geos.get(p.shape), mats.get(p.color));
      m.position.set(p.x, p.y, p.z);
      m.scale.set(p.sx, p.sy, p.sz);
      m.rotation.set(d(p.rx), d(p.ry), d(p.rz));
      m.castShadow = true;
      inner.add(m);
    }
    normalise(inner);
    return root;
  }, [recipe]);
  useEffect(
    () => () =>
      object.traverse((c) => {
        const m = c as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }),
    [object],
  );
  return <primitive object={object} />;
}

function Spin({ getT, children }: { getT: () => number; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    if (ref.current) ref.current.rotation.y = getT() * 3;
  });
  return <group ref={ref}>{children}</group>;
}

/** Sparkles to announce a model fresh from the studio. */
function StudioSparkle({ getT }: { getT: () => number }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(() => {
    const t = getT();
    ref.current?.children.forEach((c, i) => {
      const a = t * 2 + (i / 10) * Math.PI * 2;
      c.position.set(Math.cos(a) * 1.1, 0.3 + ((t * 0.8 + i * 0.13) % 1.6), Math.sin(a) * 1.1);
      c.visible = t < 6;
    });
  });
  return (
    <group ref={ref}>
      {Array.from({ length: 10 }, (_, i) => (
        <mesh key={i}>
          <octahedronGeometry args={[0.06, 0]} />
          <meshBasicMaterial color="#fff27a" />
        </mesh>
      ))}
    </group>
  );
}

function Hover({ a, focus, getT, impact, children }: ActorProps & { children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const s = 0.5 + a.size * 0.3;
  useFrame(() => {
    const t = getT();
    const g = ref.current;
    if (!g) return;
    const y = t < impact ? 14 - (14 - 3) * ease(t / impact) : 3 + Math.sin(t * 1.5) * 0.25;
    g.position.set(focus.x, y, focus.z);
    g.rotation.y = t * 0.4;
    g.scale.setScalar(s);
  });
  return <group ref={ref}>{children}</group>;
}

function CustomActor(p: ActorProps) {
  const { a } = p;
  const motion = a.recipe?.motion;
  const body = (
    <Suspense fallback={null}>
      {a.model_url ? <ModelMesh url={a.model_url} /> : <RecipeMesh recipe={a.recipe!} />}
      {a.fresh && <StudioSparkle getT={p.getT} />}
    </Suspense>
  );
  if (motion === "walk" || (!motion && WALKERS.has(a.kind)))
    return <Stomper {...p}>{body}</Stomper>;
  if (motion === "hover" || (!motion && FLYERS.has(a.kind))) return <Hover {...p}>{body}</Hover>;
  if (motion === "spin")
    return (
      <Faller {...p}>
        <Spin getT={p.getT}>{body}</Spin>
      </Faller>
    );
  return <Faller {...p}>{body}</Faller>;
}

const HITS_GROUND = new Set<ActorKind>([
  "tapir",
  "monitor_lizard",
  "durian",
  "landslide",
  "sinkhole",
  "whale",
  "meteor",
  "giant_object",
  "kaiju",
  "creature",
  "wave",
  "tornado",
]);

export function SpectacleView({
  run,
  bus,
  onImpact,
  onDone,
}: {
  run: SpectacleRun;
  bus: WorldBus;
  onImpact: (id: number) => void;
  onDone: (id: number) => void;
}) {
  const start = useRef<number | null>(null);
  const fired = useRef(false);
  const done = useRef(false);
  const impact = impactTime(run.actors);
  const clockRef = useRef(0);
  const getT = () => (start.current === null ? 0 : clockRef.current - start.current);
  const primary = run.actors[0];

  useFrame(({ clock }) => {
    clockRef.current = clock.elapsedTime;
    if (start.current === null) start.current = clock.elapsedTime;
    const t = getT();
    const now = clock.elapsedTime;
    if (!fired.current && t >= impact) {
      fired.current = true;
      onImpact(run.id);
      const big = primary ? primary.size : 2;
      bus.shake = Math.max(
        bus.shake,
        primary && HITS_GROUND.has(primary.kind) ? 0.08 + big * 0.04 : 0.05,
      );
      const { x, z } = run.focus;
      const r = run.radius;
      if (run.crowd === "flee") {
        bus.disturbances.push({ x, z, radius: r, mode: "flee", start: now, until: now + 5 });
        // Once the danger passes, onlookers drift back to gawk.
        bus.disturbances.push({ x, z, radius: r, mode: "gather", start: now + 5, until: now + 12 });
      } else if (run.crowd === "gather") {
        bus.disturbances.push({ x, z, radius: r, mode: "gather", start: now, until: now + 12 });
      } else if (run.crowd === "celebrate") {
        bus.disturbances.push({ x, z, radius: r, mode: "celebrate", start: now, until: now + 12 });
        bus.disturbances.push({ x, z, radius: r, mode: "gather", start: now, until: now + 12 });
      }
      for (const resp of run.responders) {
        bus.spawns.push({
          color: RESPONDER_COLOR[resp],
          count: 3,
          size: resp === "fire" || resp === "army" ? 1.3 : 1,
          flashing: resp !== "cleanup" && resp !== "army",
          x,
          z,
          until: now + 16,
        });
      }
      for (const a of run.actors.filter((act) => act.kind === "convoy")) {
        bus.spawns.push({
          color: a.color,
          count: Math.min(12, Math.round(a.count)),
          size: 0.8 + a.size * 0.15,
          flashing: false,
          x,
          z,
          until: now + AFTERMATH + 4,
        });
      }
    }
    if (!done.current && t >= impact + AFTERMATH) {
      done.current = true;
      onDone(run.id);
    }
  });

  return (
    <group>
      {run.actors.map((a, i) => {
        const p: ActorProps = {
          a,
          focus: run.focus,
          getT,
          impact: i === 0 ? impact : IMPACT_AT[a.kind],
          bus,
          seed: run.id * 31 + i,
        };
        if (a.model_url || a.recipe?.parts.length) return <CustomActor key={i} {...p} />;
        switch (a.kind) {
          case "whale":
            return <Whale key={i} {...p} />;
          case "giant_object":
            return <GiantObject key={i} {...p} />;
          case "meteor":
            return <Meteor key={i} {...p} />;
          case "kaiju":
            return <Kaiju key={i} {...p} />;
          case "creature":
            return <Creature key={i} {...p} />;
          case "ufo":
            return <Ufo key={i} {...p} />;
          case "tornado":
            return <Tornado key={i} {...p} />;
          case "wave":
            return <Wave key={i} {...p} />;
          case "storm":
            return <Storm key={i} {...p} />;
          case "swarm":
            return <Swarm key={i} {...p} />;
          case "rain_of":
            return <RainOf key={i} {...p} radius={run.radius} />;
          case "fireworks":
            return <Fireworks key={i} {...p} />;
          default: {
            const Lib = ACTOR_LIBRARY[a.kind as keyof typeof ACTOR_LIBRARY];
            return Lib ? <Lib key={i} {...p} /> : null;
          }
        }
      })}
      {primary && HITS_GROUND.has(primary.kind) && (
        <ImpactBurst
          focus={run.focus}
          getT={getT}
          impact={impact}
          size={primary.size}
          color={primary.kind === "whale" || primary.kind === "wave" ? "#d8f0ff" : "#c9b89c"}
        />
      )}
    </group>
  );
}

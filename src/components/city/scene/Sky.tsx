import { useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { buildingGlow } from "./Buildings";
import { lampGlow, treeWind } from "./Ground";
import { hash, hourOf, isNight, type WorldBus } from "./common";
import { env } from "./env";

const DAY = new THREE.Color("#bcdcf0");
const DUSK = new THREE.Color("#f1a36c");
const NIGHT = new THREE.Color("#1c2a4a");
const RAIN = new THREE.Color("#8d9aa4");
const CHAOS = new THREE.Color("#d9714f");
const SMOG = new THREE.Color("#b7ab86");

const RAIN_DROPS = 700;

interface Props {
  seed: number;
  day: number;
  chaos: number;
  pollution: number;
  getPhase: () => number;
  bus: WorldBus;
  shadows: boolean;
}

export function Sky({ seed, day, chaos, pollution, getPhase, bus, shadows }: Props) {
  const { scene } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const rain = useRef<THREE.InstancedMesh>(null);
  const clouds = useRef<THREE.InstancedMesh>(null);
  const sky = useMemo(() => new THREE.Color(DAY), []);
  const target = useMemo(() => new THREE.Color(), []);
  const drops = useMemo(
    () =>
      Array.from({ length: RAIN_DROPS }, () => ({
        x: (Math.random() - 0.5) * 34,
        y: Math.random() * 14,
        z: (Math.random() - 0.5) * 34,
      })),
    [],
  );
  const cloudSpots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, k) => ({
        a: (k / 12) * Math.PI * 2 + Math.random() * 0.4,
        r: 30 + Math.random() * 12,
        y: 9 + Math.random() * 5,
        s: 2 + Math.random() * 2.5,
        speed: 0.01 + Math.random() * 0.01,
      })),
    [],
  );
  const cloudMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        flatShading: true,
        transparent: true,
        opacity: 0.9,
      }),
    [],
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const lightning = useRef(0);

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const now = clock.elapsedTime;
    const hour = hourOf(getPhase());
    const elev = Math.sin(((hour - 6) / 12) * Math.PI);
    const daylight = Math.max(0, elev);
    const stormy = now < bus.stormUntil;
    // KL's famous afternoon thunderstorms, on roughly a third of days.
    const raining = stormy || (hash(seed, day) < 0.33 && hour > 15 && hour < 18.5);
    env.hour = hour;
    env.night = isNight(hour);
    env.raining = raining;

    // Lightning during storms.
    if (raining && Math.random() < dt * (stormy ? 1.2 : 0.25)) lightning.current = 1;
    lightning.current = Math.max(0, lightning.current - dt * 4);
    bus.flash = lightning.current;

    // Sky colour: night → dusk → day, greyed by rain, tinted by chaos and smog.
    const dusk = Math.max(0, 1 - Math.abs(elev) * 4);
    target.copy(NIGHT).lerp(DAY, Math.min(1, daylight * 2.5));
    target.lerp(DUSK, dusk * 0.6);
    if (raining) target.lerp(RAIN, 0.6 * Math.max(0.3, daylight));
    target.lerp(SMOG, Math.min(0.45, pollution / 180));
    target.lerp(CHAOS, Math.min(0.5, chaos / 140));
    if (lightning.current > 0) target.lerp(new THREE.Color("#ffffff"), lightning.current * 0.6);
    sky.lerp(target, Math.min(1, dt * 3));
    scene.background = sky;
    if (scene.fog) {
      scene.fog.color.copy(sky);
      const fog = scene.fog as THREE.Fog;
      fog.far = 95 - pollution * 0.45 - (raining ? 25 : 0);
      fog.near = fog.far * 0.45;
    }

    // Sun and sky light.
    const az = ((hour - 6) / 12) * Math.PI;
    if (sun.current) {
      sun.current.position.set(Math.cos(az) * 22, 4 + daylight * 24, 10 + Math.sin(az) * 4);
      sun.current.intensity = (0.1 + daylight * 2) * (raining ? 0.4 : 1);
      sun.current.color.setHSL(0.09, 0.8, 0.6 + daylight * 0.35);
    }
    if (hemi.current) {
      hemi.current.intensity =
        (0.55 + daylight * 0.55) * (raining ? 0.75 : 1) + lightning.current * 1.5;
      hemi.current.color.setHSL(env.night ? 0.62 : 0.12, 0.5, env.night ? 0.55 : 0.92);
    }

    const glow = env.night ? 1 : Math.max(0, 1 - daylight * 5);
    buildingGlow.value = glow * 0.5;
    lampGlow.value = glow;
    treeWind.value = raining ? 3 : 1;

    // Rain.
    const r = rain.current;
    if (r) {
      if (raining) {
        drops.forEach((d, k) => {
          d.y -= dt * 16;
          if (d.y < 0) {
            d.y = 12 + Math.random() * 2;
            d.x = (Math.random() - 0.5) * 34;
            d.z = (Math.random() - 0.5) * 34;
          }
          m.makeTranslation(d.x, d.y, d.z);
          r.setMatrixAt(k, m);
        });
        r.count = RAIN_DROPS;
        r.instanceMatrix.needsUpdate = true;
      } else r.count = 0;
    }

    // Drifting clouds, darker and lower in a storm.
    const c = clouds.current;
    if (c) {
      cloudMat.color.set(raining ? "#6f7780" : env.night ? "#3a4560" : "#ffffff");
      cloudSpots.forEach((s, k) => {
        s.a += dt * s.speed;
        m.compose(
          new THREE.Vector3(Math.cos(s.a) * s.r, raining ? s.y - 2 : s.y, Math.sin(s.a) * s.r),
          new THREE.Quaternion(),
          new THREE.Vector3(s.s * 1.6, s.s * 0.45, s.s),
        );
        c.setMatrixAt(k, m);
      });
      c.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <fog attach="fog" args={["#bcdcf0", 40, 95]} />
      <hemisphereLight ref={hemi} args={["#fff8e7", "#5f7552", 0.9]} />
      <directionalLight
        ref={sun}
        castShadow={shadows}
        position={[10, 20, 6]}
        intensity={1.8}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-20}
        shadow-camera-right={20}
        shadow-camera-top={20}
        shadow-camera-bottom={-20}
        shadow-camera-far={80}
        shadow-bias={-0.0005}
      />
      <instancedMesh ref={rain} args={[undefined, undefined, RAIN_DROPS]} frustumCulled={false}>
        <boxGeometry args={[0.012, 0.35, 0.012]} />
        <meshBasicMaterial color="#c9d6e3" transparent opacity={0.55} />
      </instancedMesh>
      <instancedMesh ref={clouds} args={[undefined, cloudMat, 12]} frustumCulled={false}>
        <dodecahedronGeometry args={[1, 0]} />
      </instancedMesh>
    </>
  );
}

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
const RAIN_AXIS = new THREE.Vector3(0, 0, 1);

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
  const { scene, gl } = useThree();
  const sun = useRef<THREE.DirectionalLight>(null);
  const moon = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const rain = useRef<THREE.InstancedMesh>(null);
  const clouds = useRef<THREE.InstancedMesh>(null);
  const sky = useMemo(() => new THREE.Color(DAY), []);
  const target = useMemo(() => new THREE.Color(), []);
  const drops = useMemo(
    () =>
      Array.from({ length: RAIN_DROPS }, (_, k) => ({
        x: (hash(seed + k, 311) - 0.5) * 34,
        y: hash(seed + k, 313) * 14,
        z: (hash(seed + k, 317) - 0.5) * 34,
        cycle: 0,
      })),
    [seed],
  );
  const cloudSpots = useMemo(
    () =>
      Array.from({ length: 12 }, (_, k) => ({
        a: (k / 12) * Math.PI * 2 + hash(seed + k, 331) * 0.4,
        r: 30 + hash(seed + k, 337) * 12,
        y: 9 + hash(seed + k, 347) * 5,
        s: 2 + hash(seed + k, 349) * 2.5,
        speed: 0.01 + hash(seed + k, 353) * 0.01,
      })),
    [seed],
  );
  const cloudMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: "#ffffff",
        roughness: 1,
        transparent: true,
        opacity: 0.84,
        depthWrite: false,
      }),
    [],
  );
  const m = useMemo(() => new THREE.Matrix4(), []);
  const p = useMemo(() => new THREE.Vector3(), []);
  const q = useMemo(() => new THREE.Quaternion(), []);
  const scale = useMemo(() => new THREE.Vector3(), []);
  const lightning = useRef(0);
  const nextLightning = useRef(0);
  const wasRaining = useRef(false);

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

    // Irregular but seeded lightning flashes as a storm builds.
    if (raining && !wasRaining.current) nextLightning.current = now + 1.5;
    wasRaining.current = raining;
    if (raining && now >= nextLightning.current) {
      lightning.current = 1;
      nextLightning.current =
        now + (stormy ? 0.8 : 4) + hash(seed + day, Math.floor(now * 7)) * (stormy ? 1.4 : 3);
    }
    lightning.current = Math.max(0, lightning.current - dt * 4);
    bus.flash = lightning.current;

    // Sky colour: night → dusk → day, greyed by rain, tinted by chaos and smog.
    const dusk = Math.max(0, 1 - Math.abs(elev) * 4);
    target.copy(NIGHT).lerp(DAY, Math.min(1, daylight * 2.5));
    target.lerp(DUSK, dusk * 0.6);
    if (raining) target.lerp(RAIN, 0.6 * Math.max(0.3, daylight));
    target.lerp(SMOG, Math.min(0.45, pollution / 180));
    const hazy = now < bus.hazeUntil;
    if (hazy) target.lerp(SMOG, 0.55);
    target.lerp(CHAOS, Math.min(0.5, chaos / 140));
    if (lightning.current > 0) target.lerp(new THREE.Color("#ffffff"), lightning.current * 0.6);
    sky.lerp(target, Math.min(1, dt * 3));
    scene.background = sky;
    gl.toneMappingExposure +=
      (0.88 + daylight * 0.38 + lightning.current * 0.12 - gl.toneMappingExposure) *
      Math.min(1, dt * 2);
    if (scene.fog) {
      scene.fog.color.copy(sky);
      const fog = scene.fog as THREE.Fog;
      fog.far = (95 - pollution * 0.45 - (raining ? 25 : 0)) * (hazy ? 0.4 : 1);
      fog.near = fog.far * 0.45;
    }

    // Sun and sky light.
    const az = ((hour - 6) / 12) * Math.PI;
    if (sun.current) {
      sun.current.position.set(Math.cos(az) * 22, 4 + daylight * 24, 10 + Math.sin(az) * 4);
      sun.current.intensity = (0.03 + daylight * 2.25) * (raining ? 0.36 : 1);
      sun.current.color.setHSL(0.09, 0.8, 0.6 + daylight * 0.35);
    }
    if (moon.current) {
      moon.current.intensity = (1 - daylight) * (env.night ? 0.4 : 0.06);
      moon.current.position.set(-18, 23, -12);
    }
    if (hemi.current) {
      hemi.current.intensity =
        (0.55 + daylight * 0.55) * (raining ? 0.75 : 1) + lightning.current * 1.5;
      hemi.current.color.setHSL(env.night ? 0.62 : 0.12, 0.5, env.night ? 0.55 : 0.92);
    }

    const glow = env.night ? 1 : Math.max(0, 1 - daylight * 5);
    // A blackout kills the city's lights.
    const powerOut = now < bus.blackoutUntil;
    buildingGlow.value = powerOut ? 0 : glow * 0.5;
    lampGlow.value = powerOut ? 0 : glow;
    treeWind.value = raining ? 3 : 1;

    // Rain.
    const r = rain.current;
    if (r) {
      if (raining) {
        q.setFromAxisAngle(RAIN_AXIS, 0.18 + Math.sin(now * 0.35) * 0.1);
        drops.forEach((d, k) => {
          d.y -= dt * 16;
          d.x += dt * Math.sin(now * 0.35) * 1.5;
          if (d.y < 0) {
            d.cycle++;
            d.y = 12 + hash(seed + k + d.cycle * 103, 359) * 2;
            d.x = (hash(seed + k + d.cycle * 103, 367) - 0.5) * 34;
            d.z = (hash(seed + k + d.cycle * 103, 373) - 0.5) * 34;
          }
          p.set(d.x, d.y, d.z);
          m.compose(p, q, scale.set(1, 1, 1));
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
        for (let lobe = 0; lobe < 4; lobe++) {
          const offset = lobe - 1.5;
          p.set(
            Math.cos(s.a) * s.r + offset * s.s * 0.7,
            (raining ? s.y - 2 : s.y) + Math.sin(k * 2.1 + lobe) * s.s * 0.12,
            Math.sin(s.a) * s.r + Math.cos(k + lobe) * s.s * 0.3,
          );
          m.compose(p, q.identity(), scale.set(s.s * 0.9, s.s * 0.34, s.s * 0.65));
          c.setMatrixAt(k * 4 + lobe, m);
        }
      });
      c.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <fog attach="fog" args={["#bcdcf0", 40, 95]} />
      <hemisphereLight ref={hemi} args={["#fff8e7", "#5f7552", 0.9]} />
      <directionalLight ref={moon} color="#a9c6eb" intensity={0} />
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
        <boxGeometry args={[0.008, 0.32, 0.008]} />
        <meshBasicMaterial color="#cbdce7" transparent opacity={0.48} />
      </instancedMesh>
      <instancedMesh ref={clouds} args={[undefined, cloudMat, 48]} frustumCulled={false}>
        <sphereGeometry args={[1, 16, 12]} />
      </instancedMesh>
    </>
  );
}

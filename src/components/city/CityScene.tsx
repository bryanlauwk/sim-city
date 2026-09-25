import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CityState } from "@/lib/city/types";
import { KitBuildings, LocalHouses } from "./scene/Buildings";
import { createBus, hash, type WorldBus } from "./scene/common";
import { env } from "./scene/env";
import { Crossings, Ground, StreetLamps, Trees } from "./scene/Ground";
import { KLStreetProps } from "./scene/KLStreetProps";
import { Life } from "./scene/Life";
import { Rail } from "./scene/Rail";
import { Sky } from "./scene/Sky";
import { SpectacleView, impactTime, type SpectacleRun } from "./scene/Spectacle";
import { TileFx, landmarkLabelSpecs } from "./scene/TileFx";
import { LabelOverlay, LabelProjector, type LabelRegistry, type LabelSpec } from "./scene/Labels";

export type { SpectacleRun };

export interface SimClock {
  /** performance.now() of the last daily tick. */
  tickAt: number;
  dayMs: number;
  paused: boolean;
}

/** Shakes everything inside it; any system can add to bus.shake. */
function Shaker({ bus, children }: { bus: WorldBus; children: React.ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  const phase = useRef(0);
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const a = bus.shake;
    if (a <= 0.002) {
      g.position.set(0, 0, 0);
      g.rotation.z = 0;
      bus.shake = 0;
      return;
    }
    phase.current += Math.min(dt, 0.05) * 34;
    g.position.set(
      Math.sin(phase.current * 1.7) * a * 0.46,
      Math.cos(phase.current * 2.1) * a * 0.16,
      Math.sin(phase.current * 1.3 + 1) * a * 0.38,
    );
    g.rotation.z = Math.sin(phase.current * 1.2) * a * 0.006;
    bus.shake *= Math.exp(-Math.min(dt, 0.05) * 7);
  });
  return <group ref={ref}>{children}</group>;
}

// Opening shot: looking north up Jalan Bukit Bintang towards KLCC.
const OPENING_TARGET = [1, 0, 3] as const;
const OPENING_CAMERA: [number, number, number] = [-5, 15, 23];

function ActionLights({ run }: { run: SpectacleRun }) {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const blend = Math.min(1, dt * 4);
    if (key.current)
      key.current.intensity += ((env.night ? 45 : 17) - key.current.intensity) * blend;
    if (rim.current)
      rim.current.intensity += ((env.night ? 28 : 10) - rim.current.intensity) * blend;
  });
  return (
    <>
      <pointLight
        ref={key}
        position={[run.focus.x + 3, 7, run.focus.z + 4]}
        color="#ffe4bd"
        intensity={17}
        distance={16}
        decay={2}
      />
      <pointLight
        ref={rim}
        position={[run.focus.x - 4, 6, run.focus.z - 3]}
        color="#a4c9f3"
        intensity={10}
        distance={14}
        decay={2}
      />
    </>
  );
}

/** Swoops the camera toward the action when a spectacle starts. */
function CameraDirector({ run }: { run: SpectacleRun | null }) {
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
    update: () => void;
  } | null;
  const camera = useThree((s) => s.camera);
  const clock = useThree((s) => s.clock);
  const move = useRef<{
    start: number;
    fromTarget: THREE.Vector3;
    fromPos: THREE.Vector3;
    toTarget: THREE.Vector3;
    toPos: THREE.Vector3;
    offset: THREE.Vector3;
  } | null>(null);
  const follow = useRef<{
    start: number;
    x: number;
    z: number;
    impact: number;
    focus: { x: number; z: number };
  } | null>(null);
  const subject = useMemo(() => new THREE.Vector3(), []);
  const delta = useMemo(() => new THREE.Vector3(), []);

  const framed = useRef(false);
  useEffect(() => {
    if (!controls || framed.current) return;
    framed.current = true;
    controls.target.set(OPENING_TARGET[0], 0, OPENING_TARGET[2]);
    controls.update();
  }, [controls]);

  useEffect(() => {
    if (!run || !controls) {
      follow.current = null;
      return;
    }
    const size = Math.max(1, run.actors[0]?.size ?? 1);
    const toTarget = new THREE.Vector3(run.focus.x, Math.min(1.5, size * 0.3), run.focus.z);
    // Come in close and fairly steep, from the south-east, so towers don't
    // hide the action.
    const offset = new THREE.Vector3(4 + size * 0.15, 6 + size * 0.25, 5 + size * 0.15);
    const toPos = toTarget.clone().add(offset);
    move.current = {
      start: clock.elapsedTime,
      fromTarget: controls.target.clone(),
      fromPos: camera.position.clone(),
      toTarget,
      toPos,
      offset,
    };
    const kind = run.actors[0]?.kind;
    if (kind === "kaiju" || kind === "creature") {
      const angle = hash(run.id * 31, 7) * Math.PI * 2;
      follow.current = {
        start: clock.elapsedTime,
        x: Math.cos(angle),
        z: Math.sin(angle),
        impact: impactTime(run.actors),
        focus: run.focus,
      };
    } else follow.current = null;
  }, [run?.id, controls]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock: c }, dt) => {
    const m = move.current;
    if (!controls) return;
    const tracking = follow.current;
    if (tracking) {
      const t = c.elapsedTime - tracking.start;
      const pause = 2.5;
      const off =
        t < tracking.impact
          ? 16 * (1 - t / tracking.impact)
          : t < tracking.impact + pause
            ? 0
            : -16 * ((t - tracking.impact - pause) / (10 - pause));
      const limited = Math.max(-12, Math.min(12, off));
      subject.set(
        tracking.focus.x + tracking.x * limited,
        controls.target.y,
        tracking.focus.z + tracking.z * limited,
      );
      if (m) {
        m.toTarget.x = subject.x;
        m.toTarget.z = subject.z;
        m.toPos.copy(m.toTarget).add(m.offset);
      } else {
        delta.subVectors(subject, controls.target).multiplyScalar(1 - Math.exp(-dt * 2.5));
        controls.target.add(delta);
        camera.position.add(delta);
        controls.update();
      }
    }
    if (!m) return;
    const k = Math.min(1, (c.elapsedTime - m.start) / 2.4);
    const e = k * k * k * (k * (k * 6 - 15) + 10);
    controls.target.lerpVectors(m.fromTarget, m.toTarget, e);
    camera.position.lerpVectors(m.fromPos, m.toPos, e);
    controls.update();
    if (k >= 1) move.current = null;
  });
  return null;
}

export interface CitySceneProps {
  city: CityState;
  clock: SimClock;
  spectacle: SpectacleRun | null;
  onImpact: (id: number) => void;
  onSpectacleDone: (id: number) => void;
  /** Bumped when a chain-reaction bulletin fires, for a small tremor. */
  tremor: number;
  showLabels: boolean;
}

function CityScene({
  city,
  clock,
  spectacle,
  onImpact,
  onSpectacleDone,
  tremor,
  showLabels,
}: CitySceneProps) {
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const bus = useMemo(createBus, []);
  const registry = useRef<LabelRegistry>(new Map());
  const landmarkLabels = useMemo(() => landmarkLabelSpecs(city.grid), [city.grid]);
  const labels = useMemo<LabelSpec[]>(() => {
    const text = spectacle?.actors
      .map((a) => a.label)
      .filter(Boolean)
      .join(" · ");
    if (!spectacle || !text) return landmarkLabels;
    return [
      ...landmarkLabels,
      {
        key: `action-${spectacle.id}`,
        x: spectacle.focus.x,
        y: 3.2,
        z: spectacle.focus.z,
        text,
        variant: "action",
      },
    ];
  }, [landmarkLabels, spectacle]);
  const clockRef = useRef(clock);
  const frozen = useRef(0);
  if (clock.paused && !clockRef.current.paused) {
    frozen.current = Math.min(
      1,
      (performance.now() - clockRef.current.tickAt) / clockRef.current.dayMs,
    );
  }
  clockRef.current = clock;
  const getPhase = () => {
    const c = clockRef.current;
    if (c.paused) return frozen.current;
    return Math.min(1, Math.max(0, (performance.now() - c.tickAt) / c.dayMs));
  };

  useEffect(() => {
    if (tremor) bus.shake = Math.max(bus.shake, 0.06);
  }, [tremor, bus]);

  return (
    <div className="relative h-full w-full">
      <Canvas
        shadows={small ? false : "soft"}
        dpr={[1, small ? 1.5 : 2]}
        camera={{ position: OPENING_CAMERA, fov: 40, far: 200 }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 1.05,
          powerPreference: "high-performance",
        }}
      >
        <Sky
          seed={city.seed}
          day={city.day}
          chaos={city.stats.chaos}
          pollution={city.stats.pollution}
          getPhase={getPhase}
          bus={bus}
          shadows={!small}
        />
        {spectacle && <ActionLights run={spectacle} />}
        <Shaker bus={bus}>
          <Ground grid={city.grid} />
          <Trees grid={city.grid} />
          <Crossings grid={city.grid} />
          <StreetLamps grid={city.grid} />
          <KLStreetProps grid={city.grid} />
          <KitBuildings grid={city.grid} />
          <LocalHouses grid={city.grid} />
          <TileFx grid={city.grid} />
          <Rail bus={bus} />
          <Life city={city} bus={bus} />
          {spectacle && (
            <SpectacleView
              key={spectacle.id}
              run={spectacle}
              bus={bus}
              onImpact={onImpact}
              onDone={onSpectacleDone}
            />
          )}
        </Shaker>
        <CameraDirector run={spectacle} />
        <OrbitControls
          makeDefault
          enablePan
          screenSpacePanning={false}
          minDistance={5}
          maxDistance={55}
          maxPolarAngle={1.3}
          minPolarAngle={0.3}
        />
        <LabelProjector specs={labels} registry={registry} />
      </Canvas>
      <LabelOverlay specs={labels} registry={registry} showLandmarks={showLabels && !spectacle} />
    </div>
  );
}

export default memo(CityScene);

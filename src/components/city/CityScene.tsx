import { memo, useEffect, useMemo, useRef } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { CityState } from "@/lib/city/types";
import { Buildings } from "./scene/Buildings";
import { createBus, type WorldBus } from "./scene/common";
import { Ground, StreetLamps, Trees } from "./scene/Ground";
import { Life } from "./scene/Life";
import { Rail } from "./scene/Rail";
import { Sky } from "./scene/Sky";
import { SpectacleView, type SpectacleRun } from "./scene/Spectacle";
import { TileFx } from "./scene/TileFx";

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
  useFrame((_, dt) => {
    const g = ref.current;
    if (!g) return;
    const a = bus.shake;
    if (a <= 0.002) {
      g.position.set(0, 0, 0);
      bus.shake = 0;
      return;
    }
    g.position.set(
      (Math.random() - 0.5) * a,
      (Math.random() - 0.5) * a * 0.5,
      (Math.random() - 0.5) * a,
    );
    bus.shake *= Math.pow(0.02, Math.min(dt, 0.05));
  });
  return <group ref={ref}>{children}</group>;
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
  } | null>(null);

  useEffect(() => {
    if (!run || !controls) return;
    const toTarget = new THREE.Vector3(run.focus.x, 0, run.focus.z);
    // Come in close and fairly steep, from the south-east, so towers don't
    // hide the action.
    const toPos = toTarget.clone().add(new THREE.Vector3(6, 14, 8));
    move.current = {
      start: clock.elapsedTime,
      fromTarget: controls.target.clone(),
      fromPos: camera.position.clone(),
      toTarget,
      toPos,
    };
  }, [run?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useFrame(({ clock: c }) => {
    const m = move.current;
    if (!controls || !m) return;
    const k = Math.min(1, (c.elapsedTime - m.start) / 2);
    const e = k * k * (3 - 2 * k);
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
}

function CityScene({ city, clock, spectacle, onImpact, onSpectacleDone, tremor }: CitySceneProps) {
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  const bus = useMemo(createBus, []);
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
    <Canvas
      shadows={small ? false : "percentage"}
      dpr={[1, small ? 1.5 : 2]}
      camera={{ position: [19, 18, 19], fov: 40, far: 200 }}
      gl={{ antialias: true }}
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
      <Shaker bus={bus}>
        <Ground grid={city.grid} />
        <Trees grid={city.grid} />
        <StreetLamps grid={city.grid} />
        <Buildings grid={city.grid} />
        <TileFx grid={city.grid} />
        <Rail />
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
    </Canvas>
  );
}

export default memo(CityScene);

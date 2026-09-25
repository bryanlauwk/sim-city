import { lazy, memo, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import type { CityState } from "@/lib/city/types";
import { KitBuildings, LocalHouses } from "./scene/Buildings";
import { createBus, hash, type WorldBus } from "./scene/common";
import { env } from "./scene/env";
import { Crossings, Ground, StreetLamps, Trees } from "./scene/Ground";
import { KLStreetProps } from "./scene/KLStreetProps";
import { pieceHeight, realTiles, useOsmBuildings } from "./scene/osmBuildings";
import { RealBuildings } from "./scene/RealBuildings";
import { preloadActorTextures } from "./scene/textures";
import { Life } from "./scene/Life";
import { PhotoSky } from "./scene/PhotoSky";
import { PostFX } from "./scene/PostFX";
import { Rail } from "./scene/Rail";
import { Sky } from "./scene/Sky";
import { SpectacleView, impactTime, type SpectacleRun } from "./scene/Spectacle";
import { TileFx, landmarkLabelSpecs } from "./scene/TileFx";
import { LabelOverlay, LabelProjector, type LabelRegistry, type LabelSpec } from "./scene/Labels";

export type { SpectacleRun };

// Only downloaded when there's a Google key to use it with.
const GoogleTiles = lazy(() => import("./scene/GoogleTiles"));

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

/**
 * Key and rim light on the action. They stay mounted at zero brightness
 * between events: adding or removing a light changes the scene's light count,
 * which makes three.js recompile every lit material right as an event starts.
 */
function ActionLights({ run }: { run: SpectacleRun | null }) {
  const key = useRef<THREE.PointLight>(null);
  const rim = useRef<THREE.PointLight>(null);
  useFrame((_, dt) => {
    const blend = Math.min(1, dt * 4);
    const on = run ? 1 : 0;
    if (run) {
      key.current?.position.set(run.focus.x + 3, 7, run.focus.z + 4);
      rim.current?.position.set(run.focus.x - 4, 6, run.focus.z - 3);
    }
    if (key.current)
      key.current.intensity += (on * (env.night ? 45 : 17) - key.current.intensity) * blend;
    if (rim.current)
      rim.current.intensity += (on * (env.night ? 28 : 10) - rim.current.intensity) * blend;
  });
  return (
    <>
      <pointLight ref={key} color="#ffe4bd" intensity={0} distance={16} decay={2} />
      <pointLight ref={rim} color="#a4c9f3" intensity={0} distance={14} decay={2} />
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
    /** Seconds into the spectacle, stepped like its own clock. */
    t: number;
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
        t: 0,
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
      // Same stepped clock as the spectacle, so a slow frame can't leave the
      // camera ahead of the kaiju it's following.
      tracking.t += Math.min(dt, 0.1);
      const t = tracking.t;
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
  /** Google Maps key for the real-city 3D tiles, or null for none. */
  mapsKey?: string | null;
  /** Photo mode: Google's Kuala Lumpur instead of the game's city. */
  photo?: boolean;
  /** The Google tiles couldn't load (bad key, no billing, offline). */
  onMapsFail?: () => void;
}

function CityScene({
  city,
  clock,
  spectacle,
  onImpact,
  onSpectacleDone,
  tremor,
  showLabels,
  mapsKey = null,
  photo = false,
  onMapsFail,
}: CitySceneProps) {
  const small = typeof window !== "undefined" && window.innerWidth < 640;
  // Post-processing is for larger screens; "?fx=0" turns it off on slow GPUs.
  const [fx, setFx] = useState(
    () => !small && typeof window !== "undefined" && !/[?&]fx=0\b/.test(window.location.search),
  );
  // Watch the frame rate once loading has settled; a GPU that can't keep up
  // drops the post-processing rather than the whole experience.
  const [watchFps, setWatchFps] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setWatchFps(true), 6000);
    return () => clearTimeout(id);
  }, []);
  const bus = useMemo(createBus, []);
  // The real city from Google around the map (desktop), or instead of it (photo mode).
  const [tilesFailed, setTilesFailed] = useState(false);
  const [tilesReady, setTilesReady] = useState(false);
  const tilesLoaded = useCallback(() => setTilesReady(true), []);
  const tiles =
    !!mapsKey &&
    !tilesFailed &&
    (photo || !small) &&
    typeof window !== "undefined" &&
    !/[?&]tiles=0\b/.test(window.location.search);
  const showCity = !(tiles && photo);
  const mapsFail = useRef(onMapsFail);
  mapsFail.current = onMapsFail;
  const tilesFail = useCallback(() => {
    setTilesFailed(true);
    mapsFail.current?.();
  }, []);
  // Real OpenStreetMap buildings on the tiles that still have them.
  const osm = useOsmBuildings();
  const real = useMemo(() => realTiles(city.grid, osm), [city.grid, osm]);
  const realRoofs = useMemo(() => {
    const out = new Map<number, number>();
    for (const p of osm ?? [])
      if (real.has(p.tile))
        out.set(p.tile, Math.max(out.get(p.tile) ?? 0, pieceHeight(p, city.grid[p.tile].kind)));
    return out;
  }, [osm, real, city.grid]);
  // Fetch actor textures in the background once the city is up, so the
  // first whale or kaiju of the session doesn't wait on a download.
  useEffect(() => {
    const id = setTimeout(preloadActorTextures, 2500);
    return () => clearTimeout(id);
  }, []);
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
        shadows={small ? false : "percentage"}
        dpr={[1, small || fx ? 1.5 : 2]}
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
        <ActionLights run={spectacle} />
        {/* The photographed sky streams in after the city; until then <Sky>'s colour shows. */}
        <Suspense fallback={null}>
          <PhotoSky />
        </Suspense>
        {tiles && mapsKey && (
          <Suspense fallback={null}>
            <GoogleTiles apiKey={mapsKey} photo={photo} onFail={tilesFail} onReady={tilesLoaded} />
          </Suspense>
        )}
        <Shaker bus={bus}>
          <group visible={showCity}>
            <Ground grid={city.grid} backdrop={tiles && tilesReady} />
            <Trees grid={city.grid} />
            <Crossings grid={city.grid} />
            <StreetLamps grid={city.grid} />
            <KLStreetProps grid={city.grid} />
            {osm && <RealBuildings grid={city.grid} pieces={osm} tiles={real} />}
            <KitBuildings grid={city.grid} skip={real} />
            <LocalHouses grid={city.grid} skip={real} />
            <TileFx grid={city.grid} roofs={realRoofs} />
            <Rail bus={bus} />
            <Life city={city} bus={bus} />
          </group>
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
        {fx && <PostFX />}
        {fx && watchFps && (
          <PerformanceMonitor
            bounds={() => [28, 55]}
            flipflops={1}
            onDecline={() => setFx(false)}
          />
        )}
      </Canvas>
      {osm && showCity && (
        <a
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
          className="absolute bottom-1 right-2 z-10 text-[9px] text-white/80 [text-shadow:0_1px_2px_rgba(0,0,0,0.6)] hover:underline"
        >
          Buildings © OpenStreetMap contributors
        </a>
      )}
      <LabelOverlay specs={labels} registry={registry} showLandmarks={showLabels && !spectacle} />
    </div>
  );
}

export default memo(CityScene);

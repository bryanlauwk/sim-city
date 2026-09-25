import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Tile } from "@/lib/city/types";
import { RAILROAD } from "@/lib/city/hollow";
import { CENTER, N, type WorldBus } from "./common";
import { env } from "./env";

/**
 * The freight line across town: ballast, ties and rails along its row, a
 * diesel hauling boxcars through every so often (headlight on after dark),
 * and crossing signals that flash as it passes.
 */
const Z = RAILROAD.row - CENTER;
const X0 = RAILROAD.from - CENTER - 0.5;
const X1 = RAILROAD.to - CENTER + 0.5;
const CAR = 0.46;
const CARS = 7;
const BOXCARS = ["#7a3b2a", "#5b4a3a", "#3f5a4a", "#8a6a2a", "#6a3030", "#4a4f5a"];
const SPEED = 1.4;

const tmpM = new THREE.Matrix4();
const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3(1, 1, 1);
const UP = new THREE.Vector3(0, 1, 0);

export function Railroad({ grid, bus }: { grid: Tile[]; bus: WorldBus }) {
  const ties = useRef<THREE.InstancedMesh>(null);
  const cars = useRef<THREE.InstancedMesh>(null);
  const headlight = useRef<THREE.Mesh>(null);
  const beam = useRef<THREE.SpotLight>(null);
  const signalLights = useRef<THREE.InstancedMesh>(null);

  const crossings = useMemo(
    () =>
      Array.from({ length: N }, (_, x) => x).filter(
        (x) => grid[RAILROAD.row * N + x]?.kind === "road",
      ),
    [grid],
  );

  const tieCount = Math.ceil((X1 - X0) / 0.14);
  useLayoutEffect(() => {
    for (let k = 0; k < tieCount; k++) {
      tmpM.makeTranslation(X0 + 0.07 + k * 0.14, 0.012, Z);
      ties.current?.setMatrixAt(k, tmpM);
    }
    if (ties.current) ties.current.instanceMatrix.needsUpdate = true;
  }, [tieCount]);

  const train = useRef({ x: X0 - 4, dir: 1, wait: 6 });
  const carColors = useMemo(
    () =>
      Array.from(
        { length: CARS },
        (_, k) => new THREE.Color(k === 0 ? "#d9a41e" : BOXCARS[k % BOXCARS.length]),
      ),
    [],
  );

  useFrame(({ clock }, dt) => {
    const tr = train.current;
    const length = CARS * (CAR + 0.04);
    if (bus.now >= bus.railStopUntil) {
      if (tr.wait > 0) tr.wait -= dt;
      else {
        tr.x += tr.dir * dt * SPEED;
        const gone = tr.dir > 0 ? tr.x - length > X1 + 1 : tr.x + length < X0 - 1;
        if (gone) {
          // Off the map: turn round and come back through in a while.
          tr.dir *= -1;
          tr.wait = 12 + Math.random() * 18;
        }
      }
    }
    const mesh = cars.current;
    if (mesh) {
      tmpQ.setFromAxisAngle(UP, tr.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
      for (let c = 0; c < CARS; c++) {
        const x = tr.x - tr.dir * c * (CAR + 0.04);
        const visible = x > X0 - 0.3 && x < X1 + 0.3;
        tmpP.set(x, visible ? 0.13 : -5, Z);
        tmpS.set(1, c === 0 ? 1.1 : 1, 1);
        tmpM.compose(tmpP, tmpQ, tmpS);
        mesh.setMatrixAt(c, tmpM);
        mesh.setColorAt(c, carColors[c]);
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    const front = tr.x + tr.dir * (CAR / 2 + 0.01);
    const onMap = front > X0 - 0.5 && front < X1 + 0.5;
    if (headlight.current) {
      headlight.current.position.set(front, 0.16, Z);
      headlight.current.visible = onMap;
    }
    if (beam.current) {
      beam.current.position.set(front, 0.18, Z);
      beam.current.target.position.set(front + tr.dir * 3, 0, Z);
      beam.current.target.updateMatrixWorld();
      beam.current.intensity = onMap && env.night ? 6 : 0;
    }
    // Crossing signals flash while the train is near.
    const lights = signalLights.current;
    if (lights) {
      const blink = Math.floor(clock.elapsedTime * 3) % 2;
      crossings.forEach((cx, k) => {
        const x = cx - CENTER;
        const near =
          x > Math.min(tr.x, tr.x - tr.dir * length) - 3 &&
          x < Math.max(tr.x, tr.x - tr.dir * length) + 3;
        for (let side = 0; side < 2; side++) {
          const on = near && (blink === side ? 1 : 0);
          tmpM.compose(
            tmpP.set(x + (side ? 0.12 : -0.12) + 0.42, 0.26, Z - 0.42),
            tmpQ.identity(),
            tmpS.setScalar(on ? 1 : 0.6),
          );
          lights.setMatrixAt(k * 2 + side, tmpM);
          lights.setColorAt(
            k * 2 + side,
            on ? new THREE.Color(4, 0.3, 0.2) : new THREE.Color(0.25, 0.05, 0.05),
          );
        }
      });
      lights.instanceMatrix.needsUpdate = true;
      if (lights.instanceColor) lights.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group>
      {/* Ballast bed and the two rails */}
      <mesh receiveShadow position={[(X0 + X1) / 2, 0.004, Z]}>
        <boxGeometry args={[X1 - X0, 0.008, 0.34]} />
        <meshStandardMaterial color="#6f655a" roughness={1} />
      </mesh>
      <instancedMesh
        ref={ties}
        args={[undefined, undefined, tieCount]}
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.05, 0.014, 0.28]} />
        <meshStandardMaterial color="#4a3a2c" roughness={0.95} />
      </instancedMesh>
      {[-0.07, 0.07].map((dz) => (
        <mesh key={dz} position={[(X0 + X1) / 2, 0.024, Z + dz]}>
          <boxGeometry args={[X1 - X0, 0.012, 0.012]} />
          <meshStandardMaterial color="#9aa0a4" metalness={0.7} roughness={0.35} />
        </mesh>
      ))}
      {/* Crossbucks at the level crossings */}
      {crossings.map((cx) => (
        <group key={cx} position={[cx - CENTER + 0.42, 0, Z - 0.42]}>
          <mesh castShadow position={[0, 0.17, 0]}>
            <cylinderGeometry args={[0.008, 0.01, 0.34, 6]} />
            <meshStandardMaterial color="#e8e8e8" />
          </mesh>
          {[0.7, -0.7].map((a) => (
            <mesh key={a} position={[0, 0.33, 0]} rotation={[0, 0, a]}>
              <boxGeometry args={[0.16, 0.025, 0.006]} />
              <meshStandardMaterial color="#f4f4ee" />
            </mesh>
          ))}
          <mesh position={[0, 0.26, 0]}>
            <boxGeometry args={[0.26, 0.012, 0.012]} />
            <meshStandardMaterial color="#222222" />
          </mesh>
        </group>
      ))}
      <instancedMesh
        ref={signalLights}
        args={[undefined, undefined, Math.max(1, crossings.length * 2)]}
        frustumCulled={false}
      >
        <sphereGeometry args={[0.025, 8, 6]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {/* The train */}
      <instancedMesh
        ref={cars}
        args={[undefined, undefined, CARS]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.2, 0.2, CAR]} />
        <meshStandardMaterial roughness={0.8} />
      </instancedMesh>
      <mesh ref={headlight}>
        <sphereGeometry args={[0.03, 8, 6]} />
        <meshBasicMaterial color="#fff6d0" toneMapped={false} />
      </mesh>
      <spotLight
        ref={beam}
        angle={0.45}
        penumbra={0.6}
        distance={6}
        decay={1.5}
        color="#fff2c8"
        intensity={0}
      />
    </group>
  );
}

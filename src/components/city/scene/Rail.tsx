import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { RAIL_LINES, type RailLine } from "@/lib/city/kl";
import { CENTER } from "./common";

const DECK = 1.15;
const CAR_LEN = 0.42;
const CARS = 3;

function toWorld([x, y]: [number, number]) {
  return new THREE.Vector3(x - CENTER, DECK, y - CENTER);
}

interface Track {
  pts: THREE.Vector3[];
  cum: number[];
  length: number;
}

function buildTrack(line: RailLine): Track {
  const pts = line.points.map(toWorld);
  const cum = [0];
  for (let k = 1; k < pts.length; k++) cum.push(cum[k - 1] + pts[k].distanceTo(pts[k - 1]));
  return { pts, cum, length: cum[cum.length - 1] };
}

function pointAt(track: Track, d: number, out: THREE.Vector3, dir: THREE.Vector3) {
  const s = Math.min(Math.max(d, 0), track.length);
  let k = 1;
  while (k < track.cum.length - 1 && track.cum[k] < s) k++;
  const a = track.pts[k - 1];
  const b = track.pts[k];
  const seg = track.cum[k] - track.cum[k - 1] || 1;
  out.lerpVectors(a, b, (s - track.cum[k - 1]) / seg);
  dir.subVectors(b, a).normalize();
}

const tmpM = new THREE.Matrix4();
const tmpQ = new THREE.Quaternion();
const tmpP = new THREE.Vector3();
const tmpD = new THREE.Vector3();
const FWD = new THREE.Vector3(0, 0, 1);
const ONE = new THREE.Vector3(1, 1, 1);

function Line({ line }: { line: RailLine }) {
  const track = useMemo(() => buildTrack(line), [line]);
  const trains = useRef<THREE.InstancedMesh>(null);

  // Guideway beams, pillars and station platforms are static.
  const statics = useMemo(() => {
    const beams: { pos: THREE.Vector3; len: number; yaw: number }[] = [];
    const pillars: THREE.Vector3[] = [];
    for (let k = 1; k < track.pts.length; k++) {
      const a = track.pts[k - 1];
      const b = track.pts[k];
      const len = a.distanceTo(b);
      beams.push({
        pos: a.clone().add(b).multiplyScalar(0.5),
        len,
        yaw: Math.atan2(b.x - a.x, b.z - a.z),
      });
      for (let d = 0.8; d < len; d += 1.6) pillars.push(a.clone().lerp(b, d / len));
    }
    return { beams, pillars };
  }, [track]);

  // Two trains per line running in opposite directions, pausing at stations.
  const trainState = useMemo(
    () => [
      { d: 0, dir: 1, wait: 0 },
      { d: track.length, dir: -1, wait: 0 },
    ],
    [track],
  );

  useFrame((_, dt) => {
    const mesh = trains.current;
    if (!mesh) return;
    let n = 0;
    for (const tr of trainState) {
      if (tr.wait > 0) tr.wait -= dt;
      else {
        const before = tr.d;
        tr.d += tr.dir * dt * 1.6;
        // Stop briefly when passing a station.
        for (const c of track.cum) {
          if ((before - c) * (tr.d - c) < 0) {
            tr.d = c;
            tr.wait = 1.2;
          }
        }
        if (tr.d >= track.length || tr.d <= 0) {
          tr.d = Math.min(Math.max(tr.d, 0), track.length);
          tr.dir *= -1;
          tr.wait = 1.5;
        }
      }
      for (let c = 0; c < CARS; c++) {
        pointAt(track, tr.d - tr.dir * c * (CAR_LEN + 0.04), tmpP, tmpD);
        tmpP.y += 0.11;
        tmpQ.setFromUnitVectors(FWD, tmpD);
        tmpM.compose(tmpP, tmpQ, ONE);
        mesh.setMatrixAt(n++, tmpM);
      }
    }
    mesh.count = n;
    mesh.instanceMatrix.needsUpdate = true;
  });

  const beamRef = useRef<THREE.InstancedMesh>(null);
  const pillarRef = useRef<THREE.InstancedMesh>(null);
  useLayoutEffect(() => {
    statics.beams.forEach((b, k) => {
      tmpQ.setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.yaw);
      tmpM.compose(b.pos, tmpQ, new THREE.Vector3(1, 1, b.len));
      beamRef.current?.setMatrixAt(k, tmpM);
    });
    statics.pillars.forEach((p, k) => {
      tmpM.makeTranslation(p.x, DECK / 2, p.z);
      pillarRef.current?.setMatrixAt(k, tmpM);
    });
    [beamRef, pillarRef].forEach((r) => r.current && (r.current.instanceMatrix.needsUpdate = true));
  }, [statics]);

  return (
    <group>
      <instancedMesh
        ref={beamRef}
        args={[undefined, undefined, statics.beams.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.14, 0.06, 1]} />
        <meshStandardMaterial color="#a8a59d" flatShading />
      </instancedMesh>
      <instancedMesh
        ref={pillarRef}
        args={[undefined, undefined, Math.max(1, statics.pillars.length)]}
        castShadow
        frustumCulled={false}
      >
        <cylinderGeometry args={[0.04, 0.05, DECK, 6]} />
        <meshStandardMaterial color="#a19d94" flatShading />
      </instancedMesh>
      {track.pts.map((p, k) => (
        <group key={k} position={[p.x, DECK, p.z]}>
          <mesh castShadow position={[0, 0.02, 0]}>
            <boxGeometry args={[0.42, 0.04, 0.42]} />
            <meshStandardMaterial color="#d8d4ca" flatShading />
          </mesh>
          <mesh castShadow position={[0, 0.26, 0]}>
            <boxGeometry args={[0.46, 0.03, 0.46]} />
            <meshStandardMaterial color={line.color} flatShading />
          </mesh>
          {[-0.18, 0.18].map((x) => (
            <mesh key={x} position={[x, 0.14, 0]}>
              <boxGeometry args={[0.03, 0.24, 0.03]} />
              <meshStandardMaterial color="#8d8a83" />
            </mesh>
          ))}
        </group>
      ))}
      <instancedMesh
        ref={trains}
        args={[undefined, undefined, 2 * CARS]}
        castShadow
        frustumCulled={false}
      >
        <boxGeometry args={[0.16, 0.15, CAR_LEN]} />
        <meshStandardMaterial
          color={line.color}
          flatShading
          emissive={line.color}
          emissiveIntensity={0.15}
        />
      </instancedMesh>
    </group>
  );
}

export function Rail() {
  return (
    <group>
      {RAIL_LINES.map((l) => (
        <Line key={l.name} line={l} />
      ))}
    </group>
  );
}

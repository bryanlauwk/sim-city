import { useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/**
 * Screen-space labels for 3D positions. Label elements are plain DOM nodes in
 * an overlay beside the canvas; a projector inside the canvas moves them each
 * frame. Cheaper than one React root per label.
 */
export interface LabelSpec {
  key: string;
  x: number;
  y: number;
  z: number;
  text: string;
  variant: "landmark" | "action";
}

export type LabelRegistry = Map<string, HTMLDivElement>;

const v = new THREE.Vector3();

export function LabelProjector({
  specs,
  registry,
}: {
  specs: LabelSpec[];
  registry: React.MutableRefObject<LabelRegistry>;
}) {
  const { camera, size } = useThree();
  const specsRef = useRef(specs);
  specsRef.current = specs;
  useFrame(() => {
    for (const s of specsRef.current) {
      const el = registry.current.get(s.key);
      if (!el) continue;
      v.set(s.x, s.y, s.z).project(camera);
      const behind = v.z > 1 || v.z < -1;
      el.style.visibility = behind ? "hidden" : "visible";
      if (behind) continue;
      const px = ((v.x + 1) / 2) * size.width;
      const py = ((1 - v.y) / 2) * size.height;
      el.style.transform = `translate(-50%, -50%) translate(${px}px, ${py}px)`;
    }
  });
  return null;
}

export function LabelOverlay({
  specs,
  registry,
  showLandmarks,
}: {
  specs: LabelSpec[];
  registry: React.MutableRefObject<LabelRegistry>;
  showLandmarks: boolean;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {specs.map((s) => (
        <div
          key={s.key}
          ref={(el) => {
            if (el) registry.current.set(s.key, el);
            else registry.current.delete(s.key);
          }}
          className={
            s.variant === "action"
              ? "absolute left-0 top-0 z-20 whitespace-nowrap border-2 border-black bg-[#fff8e8] px-2 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider text-black shadow-[2px_2px_0_0_#000]"
              : "absolute left-0 top-0 z-10 whitespace-nowrap rounded-sm bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-medium text-white"
          }
          style={{
            display: s.variant === "landmark" && !showLandmarks ? "none" : "block",
            visibility: "hidden",
          }}
        >
          {s.text}
        </div>
      ))}
    </div>
  );
}

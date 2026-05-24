import { useEffect, useState } from "react";
import { ASSETS } from "./assets";
import type { SimState } from "@/lib/terrarium/types";

interface Props {
  state: SimState;
  width?: number;
  height?: number;
}

// Plant intrinsic display sizes (px at stage 2) — tuned per species
const PLANT_SIZE: Record<string, { w: number; h: number }> = {
  fern: { w: 150, h: 200 },
  moss: { w: 120, h: 70 },
  pilea: { w: 130, h: 160 },
  lichen: { w: 110, h: 80 },
  orchid: { w: 90, h: 180 },
};

// Fauna intrinsic display sizes
const FAUNA_SIZE: Record<string, number> = {
  springtail: 18,
  isopod: 28,
  snail: 40,
  ant: 24,
};

export function TerrariumScene({ state, width = 560, height = 620 }: Props) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      setTick((t) => (t + 1) % 100000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Interior geometry within the jar.png (1024x1024 source).
  // Interior bounds (as % of scene box): roughly x 9%..91%, y 17%..93%.
  const interior = { left: 0.1, right: 0.9, top: 0.2, bottom: 0.86 };
  const intW = (interior.right - interior.left) * width;
  const intH = (interior.bottom - interior.top) * height;
  const intX = interior.left * width;
  const intY = interior.top * height;

  const substrateImg = ASSETS.substrate[state.recipe.substrate];
  const substrateH = 110; // px
  const soilTopY = intY + intH - substrateH + 20;

  const condOpacity = Math.max(0, Math.min(0.7, (state.humidity - 55) / 100));
  const moldOpacity = Math.min(0.7, state.moldCover / 100);

  return (
    <div
      className="relative select-none"
      style={{ width, height }}
      aria-label="Terrarium"
    >
      {/* Soft bokeh backdrop behind the jar */}
      <div
        className="absolute inset-0 rounded-2xl"
        style={{
          background:
            "radial-gradient(ellipse at 30% 40%, oklch(0.78 0.08 140 / 0.55), transparent 60%), radial-gradient(ellipse at 70% 60%, oklch(0.7 0.06 80 / 0.4), transparent 65%), linear-gradient(180deg, oklch(0.92 0.02 130), oklch(0.86 0.03 100))",
          filter: "blur(0.5px)",
        }}
      />
      <div
        className="absolute inset-0 rounded-2xl pointer-events-none"
        style={{
          background:
            "radial-gradient(circle at 25% 30%, oklch(0.95 0.03 130 / 0.5), transparent 35%), radial-gradient(circle at 80% 70%, oklch(0.7 0.1 60 / 0.35), transparent 30%)",
          filter: "blur(20px)",
        }}
      />

      {/* Interior tinting (humidity hue) */}
      <div
        className="absolute rounded-[40%] pointer-events-none"
        style={{
          left: intX,
          top: intY,
          width: intW,
          height: intH,
          background: `radial-gradient(ellipse at 50% 35%, oklch(0.86 0.05 ${140 + state.humidity * 0.3} / 0.45), transparent 70%)`,
          mixBlendMode: "multiply",
        }}
      />

      {/* Substrate slab — clipped to jar interior */}
      <div
        className="absolute overflow-hidden pointer-events-none"
        style={{
          left: intX,
          top: soilTopY,
          width: intW,
          height: substrateH + 10,
          borderRadius: "0 0 45% 45% / 0 0 80% 80%",
        }}
      >
        <img
          src={substrateImg}
          alt=""
          className="w-full h-full object-cover object-bottom"
          draggable={false}
        />
      </div>

      {/* Mold patches on substrate */}
      {moldOpacity > 0.05 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: intX,
            top: soilTopY - 10,
            width: intW,
            height: 60,
            opacity: moldOpacity,
            backgroundImage: `url(${ASSETS.mold})`,
            backgroundSize: "120px",
            backgroundRepeat: "repeat-x",
            backgroundPosition: "center top",
            mixBlendMode: "screen",
          }}
        />
      )}

      {/* Plants */}
      {state.plants.map((p, i) => {
        const def = PLANT_SIZE[p.defId] ?? { w: 100, h: 140 };
        const scale = p.dead ? 0.45 : 0.55 + p.stage * 0.22 + (p.health / 100) * 0.15;
        const w = def.w * scale;
        const h = def.h * scale;
        const x = intX + p.x * intW;
        const baseY = soilTopY + 18;
        return (
          <img
            key={p.id}
            src={ASSETS.plant[p.defId]}
            alt=""
            draggable={false}
            className="absolute pointer-events-none origin-bottom"
            style={{
              left: x,
              top: baseY - h,
              width: w,
              height: h,
              transform: `translateX(-50%) rotate(${Math.sin((tick + i * 30) * 0.01) * 0.8}deg)`,
              transformOrigin: "50% 100%",
              filter: p.dead
                ? "grayscale(0.7) sepia(0.4) brightness(0.7)"
                : `saturate(${0.7 + (p.health / 100) * 0.5}) brightness(${0.85 + (p.health / 100) * 0.25})`,
              opacity: p.dead ? 0.6 : 1,
              zIndex: 10 + Math.floor(p.x * 10),
            }}
          />
        );
      })}

      {/* Fauna */}
      {state.fauna.map((f) => {
        if (!f.alive) return null;
        const size = FAUNA_SIZE[f.defId] ?? 20;
        const x = intX + 12 + f.x * (intW - 24);
        const livableTop = intY + 30;
        const livableBot = soilTopY + 4;
        const y = livableTop + f.y * (livableBot - livableTop);
        const flip = f.vx < 0;
        return (
          <img
            key={f.id}
            src={ASSETS.fauna[f.defId]}
            alt=""
            draggable={false}
            className="absolute pointer-events-none"
            style={{
              left: x,
              top: y,
              width: size,
              height: size,
              transform: `translate(-50%, -50%) scaleX(${flip ? -1 : 1})`,
              zIndex: 30,
              filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.25))",
            }}
          />
        );
      })}

      {/* Jar overlay (glass + cork + brass) */}
      <img
        src={ASSETS.jar}
        alt="Glass terrarium jar"
        draggable={false}
        className="absolute inset-0 w-full h-full pointer-events-none"
        style={{ zIndex: 40 }}
      />

      {/* Condensation overlay (inside glass) */}
      {condOpacity > 0.02 && (
        <div
          className="absolute pointer-events-none"
          style={{
            left: intX,
            top: intY,
            width: intW,
            height: intH * 0.7,
            opacity: condOpacity,
            background:
              "radial-gradient(circle at 20% 30%, white 1px, transparent 1.5px) 0 0/14px 14px, radial-gradient(circle at 60% 70%, white 1px, transparent 1.5px) 7px 7px/18px 18px",
            mixBlendMode: "screen",
            borderRadius: "50%",
            zIndex: 45,
          }}
        />
      )}

      {/* Day badge */}
      <div
        className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-foreground/75 backdrop-blur-sm text-background"
        style={{ zIndex: 60 }}
      >
        <span className="font-serif-d text-xs tracking-widest uppercase opacity-70">Day</span>{" "}
        <span className="font-serif-d text-lg font-medium">{state.day}</span>
      </div>
    </div>
  );
}
import { useEffect, useRef } from "react";
import type { SimState } from "@/lib/terrarium/types";
import { plantById, faunaById, substrateById } from "@/lib/terrarium/species";

interface Props {
  state: SimState;
  width?: number;
  height?: number;
}

// Pure pixel-art renderer. No external sprites — everything drawn from primitives.
export function TerrariumCanvas({ state, width = 480, height = 540 }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const tRef = useRef(0);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.imageSmoothingEnabled = false;

    const render = () => {
      tRef.current += 1;
      draw(ctx, canvas.width, canvas.height, state, tRef.current);
      rafRef.current = requestAnimationFrame(render);
    };
    render();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state]);

  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className="pixelated rounded-lg"
      style={{ width, height, imageRendering: "pixelated" }}
    />
  );
}

function draw(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  s: SimState,
  t: number,
) {
  // Sky/background gradient (cozy warm)
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, "#f3e7c9");
  bg.addColorStop(1, "#e6d2a8");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Soft shelf shadow
  ctx.fillStyle = "rgba(80,50,20,0.12)";
  ctx.fillRect(0, H - 30, W, 30);

  // Jar bounds
  const jarX = 40;
  const jarY = 50;
  const jarW = W - 80;
  const jarH = H - 110;

  // Jar back (inside) — humidity tint
  const hum = s.humidity / 100;
  const tintR = Math.round(200 - hum * 40);
  const tintG = Math.round(220 - hum * 20);
  const tintB = Math.round(200 + hum * 30);
  ctx.fillStyle = `rgb(${tintR},${tintG},${tintB})`;
  ctx.fillRect(jarX, jarY, jarW, jarH);

  // Substrate
  const sub = substrateById(s.recipe.substrate);
  const soilTop = jarY + jarH - 90;
  const soilH = 90;
  ctx.fillStyle = sub.color;
  ctx.fillRect(jarX, soilTop, jarW, soilH);
  // Drainage layer (pebbles)
  ctx.fillStyle = "#5a5a55";
  ctx.fillRect(jarX, soilTop + soilH - 12, jarW, 12);
  for (let i = 0; i < 22; i++) {
    ctx.fillStyle = i % 2 ? "#7a7a72" : "#4a4a45";
    ctx.fillRect(jarX + 4 + i * ((jarW - 8) / 22), soilTop + soilH - 10, 6, 4);
  }
  // Soil texture dots
  ctx.fillStyle = "rgba(0,0,0,0.18)";
  for (let i = 0; i < 60; i++) {
    const x = jarX + ((i * 37) % (jarW - 4));
    const y = soilTop + 4 + ((i * 53) % (soilH - 18));
    ctx.fillRect(x, y, 2, 2);
  }

  // Plants (rooted at substrate top)
  for (const p of s.plants) {
    const def = plantById(p.defId);
    const px = jarX + p.x * jarW;
    const baseY = soilTop + 2;
    drawPlant(ctx, px, baseY, def.color, def.accent, p.stage, p.dead, p.defId);
  }

  // Mold patches on substrate
  if (s.moldCover > 1) {
    ctx.fillStyle = "rgba(240,240,225,0.85)";
    const patches = Math.floor(s.moldCover / 4);
    for (let i = 0; i < patches; i++) {
      const x = jarX + 6 + ((i * 71) % (jarW - 14));
      const y = soilTop + 2 + ((i * 41) % 30);
      const sz = 3 + ((i * 13) % 4);
      ctx.fillRect(x, y, sz, sz);
      ctx.fillRect(x + 2, y - 1, sz - 1, 1);
    }
  }

  // Fauna
  for (const f of s.fauna) {
    if (!f.alive) continue;
    const def = faunaById(f.defId);
    const fx = jarX + 6 + f.x * (jarW - 12);
    const livableTop = jarY + 20;
    const livableBot = soilTop - 4;
    const fy = livableTop + f.y * (livableBot - livableTop);
    drawFauna(ctx, fx, fy, def.color, f.defId, t);
  }

  // Glass front overlay
  ctx.fillStyle = "rgba(255,255,255,0.06)";
  ctx.fillRect(jarX, jarY, jarW, jarH);
  // Vertical highlight
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  ctx.fillRect(jarX + 10, jarY + 6, 4, jarH - 12);

  // Condensation droplets when humid
  if (s.humidity > 70) {
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    const drops = Math.min(40, Math.floor((s.humidity - 70) * 1.5));
    for (let i = 0; i < drops; i++) {
      const x = jarX + 6 + ((i * 53) % (jarW - 12));
      const y = jarY + 6 + ((i * 29 + Math.floor(t / 60)) % (jarH - 100));
      ctx.fillRect(x, y, 2, 2);
    }
  }

  // Jar outline (chunky pixel border)
  ctx.strokeStyle = "#2b1a0c";
  ctx.lineWidth = 4;
  ctx.strokeRect(jarX, jarY, jarW, jarH);
  // Jar lid
  ctx.fillStyle = "#3a2418";
  ctx.fillRect(jarX - 8, jarY - 18, jarW + 16, 16);
  ctx.fillStyle = "#5a3a24";
  ctx.fillRect(jarX - 8, jarY - 18, jarW + 16, 4);

  // Day badge
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(jarX + 8, jarY + 8, 96, 22);
  ctx.fillStyle = "#f5e6b8";
  ctx.font = "16px VT323, monospace";
  ctx.fillText(`DAY ${s.day}`, jarX + 14, jarY + 24);
}

function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  baseY: number,
  color: string,
  accent: string,
  stage: number,
  dead: boolean,
  kind: string,
) {
  const c = dead ? "#6b5a3a" : color;
  const a = dead ? "#8a7752" : accent;
  const h = dead ? 6 : stage === 0 ? 10 : stage === 1 ? 22 : 34;

  // stem
  ctx.fillStyle = "#3a2a18";
  ctx.fillRect(x - 1, baseY - h, 2, h);

  if (kind === "fern") {
    // fronds
    for (let i = 0; i < 4; i++) {
      const y = baseY - 4 - i * (h / 4);
      const spread = 4 + i * 2;
      ctx.fillStyle = c;
      ctx.fillRect(x - spread, y, spread * 2, 2);
      ctx.fillStyle = a;
      ctx.fillRect(x - spread + 1, y - 1, 2, 1);
    }
  } else if (kind === "moss") {
    ctx.fillStyle = c;
    ctx.fillRect(x - 6, baseY - h, 12, h);
    ctx.fillStyle = a;
    for (let i = 0; i < 6; i++) {
      ctx.fillRect(x - 5 + i * 2, baseY - h - 1, 1, 2);
    }
  } else if (kind === "pilea") {
    // round leaves
    for (let i = 0; i < 5; i++) {
      const ang = (i / 5) * Math.PI * 2;
      const lx = x + Math.cos(ang) * 6;
      const ly = baseY - h + Math.sin(ang) * 4;
      ctx.fillStyle = c;
      ctx.fillRect(lx - 2, ly - 2, 4, 4);
      ctx.fillStyle = a;
      ctx.fillRect(lx - 1, ly - 1, 1, 1);
    }
  } else if (kind === "lichen") {
    ctx.fillStyle = c;
    ctx.fillRect(x - 5, baseY - 4, 10, 3);
    ctx.fillStyle = a;
    ctx.fillRect(x - 4, baseY - 5, 2, 1);
    ctx.fillRect(x + 1, baseY - 5, 2, 1);
  } else if (kind === "orchid") {
    ctx.fillStyle = c;
    ctx.fillRect(x - 4, baseY - h, 8, 4);
    ctx.fillStyle = a;
    ctx.fillRect(x - 3, baseY - h - 1, 6, 1);
    ctx.fillRect(x - 1, baseY - h - 2, 2, 1);
    // leaves
    ctx.fillStyle = "#3a7d44";
    ctx.fillRect(x - 5, baseY - 6, 10, 2);
  }
}

function drawFauna(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  kind: string,
  t: number,
) {
  const bob = Math.sin((t + x) * 0.1) * 0.5;
  const yy = y + bob;
  if (kind === "springtail") {
    ctx.fillStyle = color;
    ctx.fillRect(x, yy, 2, 2);
  } else if (kind === "isopod") {
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, yy, 5, 3);
    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(x - 2, yy, 5, 1);
    ctx.fillRect(x - 1, yy + 2, 1, 1);
    ctx.fillRect(x + 1, yy + 2, 1, 1);
  } else if (kind === "snail") {
    ctx.fillStyle = "#a88a5c";
    ctx.fillRect(x - 3, yy + 1, 6, 3);
    ctx.fillStyle = color;
    ctx.fillRect(x - 1, yy - 2, 4, 4);
    ctx.fillStyle = "#6b4a28";
    ctx.fillRect(x, yy - 1, 2, 2);
  } else if (kind === "ant") {
    ctx.fillStyle = color;
    ctx.fillRect(x - 2, yy + 1, 2, 2);
    ctx.fillRect(x, yy + 1, 2, 2);
    ctx.fillRect(x + 2, yy + 1, 2, 2);
    ctx.fillRect(x - 1, yy, 1, 1);
    ctx.fillRect(x + 3, yy, 1, 1);
  }
}